const { forEach } = require('lodash');
var BaseModel = require('../../../lib/base.js'),
    util = require('util'),
    filter = require('../../../lib/filter.js'),
    status = require('../../../lib/omsstatus.js'),
    traduction = require('../../../lib/traduction.js'),
    apilib = require('../../../lib/api.js');

var is_wh_pending = false;
var oms_host_domain = process.env.OMS_API_URL;
var oms_auth_key = process.env.OMS_AUTH_KEY;

function get() {
    get.super_.apply(this, arguments);
}

get.super_ = BaseModel;

util.inherits(get, BaseModel);

//REWRITE THE BASE BEHAVIOR

get.prototype.path = function (event) {
    var hfmCode = "";
    let url = "";
    let index = 0;
    let ypos = 0;
    if(event?.requestContext?.authorizer?.hfmCode){
        hfmCode = event.requestContext.authorizer.hfmCode;
    }       
    if(event?.queryStringParameters?.page){
        url = "/api/v1/"+hfmCode+"/orders?page="+event.queryStringParameters.page;
    }else{
        url  = "/api/v1/"+hfmCode+"/orders";
    }

    //apply OMS filters as query string
    var statusTable = status.statusTable();
    var  orderStatus = statusTable.filter(obj => {
            return obj.split('|')[1] == event.queryStringParameters.status
        })
        var listOfStatus = orderStatus.map(function(obj){return obj.split("|")[0]});
        if(listOfStatus && listOfStatus[0]){
            url = filter.applyOmsStatusTableFilter(listOfStatus,url,index,ypos);             
        }        
        url = filter.applyOmsLocationFilter(event,url,index);
        url = filter.applyOmsTerminalFilter(event,url,index);
    return url;
};


get.prototype.forward = function (event) {
    if (event.body !== null) {
        post_data = event.body;
    } else {
        post_data = "";
    }    
    api = new apilib(oms_host_domain, this.path(event), event.httpMethod, oms_auth_key, JSON.stringify(post_data), this.ondata, this.onerror, this);
    api.call();
};

get.prototype.magentopath = function (event) {
    var id_type = "id";
    if (event.app.queryfilter.channel) {
        id_type = "external_order_id";
    }
    return event.app.mag_api_path + '/dufry-oms/orderlist?' + filter.filterQuery(id_type, event.pathParameters.OrderId, 'eq', 0, 0) + '&' + event.app.filters;

};

get.prototype.chunk = function (chunk, event, res) {
    try {
        if (res.statusCode != 200) {       
            var json = {lang: event.headers.posLanguage, message: JSON.parse(chunk).message, url:"getorderslist"};
            var message = traduction.getTraducedWord(json);
            response = {
                "success": false,
                "message": message,
                "data": "",
                "requestId": global.requestId,
            }
            return JSON.stringify(response);
        }
        var orders = JSON.parse(chunk);
        var dataTemplate = "{\"data\":[]}";
        var orderTemplate;
        if(event.version == "v1"){
            var orderTemplate = "{\"incrementId\":\"\",\"externalOrderId\":\"\",\"retrievalDate\":\"\",\"status\":\"\",\"statusMagento\":\"\",\"channel\":\"\",\"pickupStoreCode\":\"\",\"Name\":\"\",\"FirstName\":\"\",\"LastName\":\"\",\"email\":\"\",\"ETicket\":\"\",\"RedCustomerNumber\":\"\",\"CustomerTier\":\"Gold\",\"Modifiable\":\"\",\"OrderAmount\":\"\",\"OrderAmountPaid\":\"\",\"Currency\":\"USD\", \"AppliedRuleAdv\":\"\"}"
        }else{
            var orderTemplate = "{\"incrementId\":\"\",\"externalOrderId\":\"\",\"retrievalDate\":\"\",\"status\":\"\",\"statusMagento\":\"\",\"channel\":\"\",\"pickupStoreCode\":\"\",\"Name\":\"\",\"FirstName\":\"\",\"LastName\":\"\",\"email\":\"\",\"ETicket\":\"\",\"RedCustomerNumber\":\"\",\"CustomerTier\":\"Gold\",\"Modifiable\":\"\",\"OrderAmount\":\"\",\"OrderAmountPaid\":\"\",\"Currency\":\"USD\", \"ApplyBestDeal\":\"\", \"CustomerID\":\"\", \"AppliedRuleAdv\":\"\"}"
        }
        var data = JSON.parse(dataTemplate).data;
        
        if (orders.data && orders.data.items && orders.data.items.data[0]) {
            orders.data.items.data.forEach(function (item) {    
                var order = JSON.parse(orderTemplate);
                var aggregatedADVCode = "";
                order.incrementId = item.id;
                order.externalOrderId = item.partner_order_source?item.external_order_id:"";
                order.retrievalDate = item.pickup_date;
                var statusTable = status.statusTable();
                orderStatus = statusTable.filter(obj => {
                    return obj.split('|')[0] == item.status
                })
                order.status = (orderStatus&&orderStatus[0])?orderStatus[0].split('|').pop():"";
                order.statusMagento = item.status;
                order.channel = item.partner_order_source?item.partner_order_source:process.env.CHANNEL;
                order.pickupStoreCode = event.pathParameters.StoreId;
                order.Name = item.firstname + ' ' + item.lastname;
                order.FirstName = item.firstname;
                order.LastName = item.lastname;
                order.email = item.email;
                order.ETicket = process.env.ETICKET;
                order.RedCustomerNumber = (item.red_customer_id?item.red_customer_id:"");
                order.CustomerTier = (item.red_customer_tier?item.red_customer_tier:"");
                order.OrderAmount = 0;
                order.Currency = item.currency;
                if(event.version != "v1"){
                    if(item.epayment == 1){
                        order.ApplyBestDeal = "false";
                    }else{
                        order.ApplyBestDeal = "true";
                    }
                    order.CustomerID = new Object();
                    if(item.travel_document_type && item.travel_document){
                        order.CustomerID[item.travel_document_type] = item.travel_document;
                    }
                    if(item.cpf ){
                        order.CustomerID["CPF"] =  item.cpf;
                    }
                }
                item.items.forEach(function(element){
                    
                    order.OrderAmount += parseFloat(element.row_total, 10);
                    
                    if(aggregatedADVCode != ""){
                        aggregatedADVCode += ","+element.promotion_code;
                    }else{
                        aggregatedADVCode += element.promotion_code;
                    }
                    
                });
                order.OrderAmount =  order.OrderAmount.toFixed(2);  
                if(item.payment_confirmed_amount != null ){
                    order.OrderAmountPaid = item.payment_confirmed_amount;
                }else{
                    order.OrderAmountPaid = "0.00";               
                }                                
                
                order.Currency = item.currency;
                if(order.channel == "AENA"){
                    order.FirstName = order.channel;
                    order.LastName = order.externalOrderId;
                }
                if(order.status == "pending" || order.status == "ready"){
                    order.Modifiable = "1";
                } else {
                    order.Modifiable = "0";
                }

                if (item.epayment){// a payment with transactions means ePayment
                    order.ePayment = "1";
                }else{
                    order.ePayment = "0";
                }
                ///SET EPAYMENT = true until OMS is properly informed
                order.ePayment = "1";
                order.AppliedRuleAdv = (item.applied_ruleadv!= ""? item.applied_ruleadv: aggregatedADVCode!= "" || aggregatedADVCode!= ","? aggregatedADVCode: "" );

                data.push(order);
            });
        }
            var json = {lang: event.headers.posLanguage, message: "Welcome at DUFRY R&C Pickup service. This is the list of $7 orders", url:"getorderslist", status:event.app.queryfilter.status};
            var message = traduction.getTraducedWord(json);
            var response = {
                "success": true,
                "message": message,
                "data": data
            }
            return JSON.stringify(response);

    } catch (e) {
        var json = {lang: event.headers.posLanguage, message: 'Error: An unexpected error happened', url:"getorderslist"};
        var message = traduction.getTraducedWord(json);
        response = {
            "success": false,
            "message": message,
            "data": "",
            "requestId": global.requestId,
        }
        return JSON.stringify(response);
    }
};
module.exports = get;
