var BaseModel = require('../../../../lib/base.js'),
    util = require('util'),
    apilib = require('../../../../lib/api.js'),
    filter = require('../../../../lib/filter.js'),
    status = require('../../../../lib/omsstatus.js'),
    traduction = require('../../../../lib/traduction.js');
var entity_id;
this.magentoorder;
var parsedMagentoOrder;
var epayment = false;
var oms_host_domain = process.env.OMS_API_URL;
var oms_auth_key = process.env.OMS_AUTH_KEY;

var gamma_shipping_sku = process.env.GAMMA_SHIPPING_SKU;
var gamma_shipped = false;
var gamma_invoiced = false;
var gamma_canceled = false;


function get() {
    get.super_.apply(this, arguments);
}

get.super_ = BaseModel;

util.inherits(get, BaseModel);

//REWRITE THE BASE BEHAVIOR

get.prototype.path = function (event) {
    console.log(JSON.stringify(event));
    var hfmCode = "";
    let url = "";
    let index = 0;
    if(event?.requestContext?.authorizer?.hfmCode){
        hfmCode = event.requestContext.authorizer.hfmCode;
    }
    if(event?.queryStringParameters?.page){
        url = "/api/v1/"+hfmCode+"/orders?page="+event.queryStringParameters.page;
    }else{
        url = "/api/v1/"+hfmCode+"/orders";
    }
    //apply OMS filters as query string    
    url = filter.applyOmsLocationFilter(event,url,index);
    url = filter.applyOmsTerminalFilter(event,url,index);
    url = filter.applyOmsOrderIdFilter(event,url,index);
    return url;    
};

get.prototype.forward = async function (event) {
    let post_data = "";
    if (event.body !== null) {
        post_data = event.body;
    } else {
        post_data = "";
    }

    let api = new apilib(oms_host_domain, this.path(event), event.httpMethod, oms_auth_key, post_data, this.ondata, this.onerror, this);
    api.call();
};

get.prototype.post = async function (event, context, res, chunk) {

    if( JSON.parse(chunk).data.items.data[0].epayment == 1){
        epayment = true;  
    }else{  
        epayment = false;
    }
};

get.prototype.magentopath = function (event) {
    var id_type = "increment_id";
    if (event.app.queryfilter.channel) {
        id_type = "external_order_id";
    }
    return event.app.mag_api_path + '/dufry-oms/orderlist?' + filter.filterQuery(id_type, event.pathParameters.OrderId, 'eq', 0, 0) + '&' + event.app.filters;
};

//REWRITE THE BASE BEHAVIOR
get.prototype.chunk = async function (chunk, event, res) {
    try {
        try {
            var order = JSON.parse(chunk);

        }
        catch (e) {
            throw { lang: event.headers.posLanguage, message: "Error: Bad gateway", url: "getorders" };
        }

        if (!order.items && order.message) {
            throw { lang: event.headers.posLanguage, message: order.message, url: "getorders" };
        }

        if (order.data.size != 1) {
            throw { lang: event.headers.posLanguage, message: "Error: The order requested doesn’t exist", url: "getorders" };
        }
        var customerTier = "";
        if (!order.data.items.data[0].customer_is_guest) {

        }

        //delete order.data.items.data[0].customer_is_guest;

        var success;
        if(event.version == "v1"){    
            var dataTemplate = "{\"data\":{\"incrementId\":\"\",\"retrievalDate\":\"\",\"status\":\"\",\"statusMagento\":\"\",\"channel\":\"\", \"pickupStoreCode\":\"\", \"Name\":\"\", \"FirstName\": \"\", \"LastName\":\"\", \"email\":\"\", \"ETicket\":\"\", \"RedCustomerNumber\":\"\", \"CustomerTier\":\"\", \"Modifiable\":\"\", \"OrderAmount\":\"\",\"OrderAmountPaid\":\"\", \"Currency\":\"\", \"AppliedRuleAdv\":\"\", \"Items\":[], \"Payments\":{\"Amount\":\"\",\"Currency\":\"\",\"MerchantId\":\"\",\"MerchantReference\":\"\",\"AuthorizationCode\":\"\",\"CardNumber\":\"\",\"CardExpiryDate\":\"\",\"CardHolderName\":\"\",\"TransactionId\":\"\",\"TxDateTime\":\"\",\"Currency\":\"\"}}}";
            var dataTemplate1 = "{\"data\":{\"incrementId\":\"\",\"retrievalDate\":\"\",\"status\":\"\",\"statusMagento\":\"\",\"channel\":\"\", \"pickupStoreCode\":\"\", \"Name\":\"\", \"FirstName\": \"\", \"LastName\":\"\", \"email\":\"\", \"ETicket\":\"\", \"RedCustomerNumber\":\"\", \"CustomerTier\":\"\", \"Modifiable\":\"\", \"OrderAmount\":\"\",\"OrderAmountPaid\":\"\", \"Currency\":\"\", \"AppliedRuleAdv\":\"\", \"Items\":[]}}";
        }else{
            var dataTemplate = "{\"data\":{\"incrementId\":\"\",\"retrievalDate\":\"\",\"status\":\"\",\"statusMagento\":\"\",\"channel\":\"\", \"pickupStoreCode\":\"\", \"Name\":\"\", \"FirstName\": \"\", \"LastName\":\"\", \"email\":\"\", \"ETicket\":\"\", \"RedCustomerNumber\":\"\", \"CustomerTier\":\"\", \"Modifiable\":\"\", \"OrderAmount\":\"\",\"OrderAmountPaid\":\"\", \"Currency\":\"\", \"ApplyBestDeal\":\"\", \"CustomerID\":\"\",\"AppliedRuleAdv\":\"\", \"Items\":[], \"Payments\":{\"Amount\":\"\",\"Currency\":\"\",\"MerchantId\":\"\",\"MerchantReference\":\"\",\"AuthorizationCode\":\"\",\"CardNumber\":\"\",\"CardExpiryDate\":\"\",\"CardHolderName\":\"\",\"TransactionId\":\"\",\"TxDateTime\":\"\",\"Currency\":\"\"}}}";
            var dataTemplate1 = "{\"data\":{\"incrementId\":\"\",\"retrievalDate\":\"\",\"status\":\"\",\"statusMagento\":\"\",\"channel\":\"\", \"pickupStoreCode\":\"\", \"Name\":\"\", \"FirstName\": \"\", \"LastName\":\"\", \"email\":\"\", \"ETicket\":\"\", \"RedCustomerNumber\":\"\", \"CustomerTier\":\"\", \"Modifiable\":\"\", \"OrderAmount\":\"\",\"OrderAmountPaid\":\"\", \"Currency\":\"\",  \"ApplyBestDeal\":\"\", \"CustomerID\":\"\", \"AppliedRuleAdv\":\"\", \"Items\":[]}}";
        }

        var itemTemplate = "{\"item\":{\"LocalItemCode\":\"\",\"GlobalItemCode\":\"\",\"Qty\":\"\",\"QtyOrdered\":\"\",\"QtyShipped\":\"\",\"QtyInvoiced\":\"\",\"QtyCanceled\":\"\", \"AppliedRuleAdv\": \"\",\"SalesmanCode\": \"\",\"Price\":\"\",\"RowTotal\":\"\"}}";

        var data = JSON.parse(dataTemplate).data;
        var statusTable = status.statusTable();
        orderStatus = statusTable.filter(obj => {
            return obj.split('|')[0] == order.data.items.data[0].status
        })
        var statusOrder = (orderStatus && orderStatus[0]) ? orderStatus[0].split('|').pop() : "";

        if (statusOrder != "complete") {
            data = JSON.parse(dataTemplate1).data;
        }

        if (res.statusCode != 200) {
            var json = { lang: event.headers.posLanguage, message: res.statusCode, url: "getorders" };
            var message = traduction.getTraducedWord(json);
            response = {
                "success": false,
                "message": message,
                "data": "",
                "requestId": global.requestId,
            }
            return JSON.stringify(response);
        }

        if (order && order.data && order.data.items && order.data.items.data) {
            var flagPaid = false;
            var flagCapture = false;
            var aggregatedADVCode = "";
            data.incrementId = order.data.items.data[0].partner_order_source ? order.data.items.data[0].external_order_id : event.pathParameters.OrderId;
            data.retrievalDate = order.data.items.data[0].pickup_date;
            var statusTable = status.statusTable();
            orderStatus = statusTable.filter(obj => {
                return obj.split('|')[0] == order.data.items.data[0].status
            })
            data.status = (orderStatus && orderStatus[0]) ? orderStatus[0].split('|').pop() : "";
            data.statusMagento = order.data.items.data[0].status;
            data.channel = order.data.items.data[0].partner_order_source ? order.data.items.data[0].partner_order_source : process.env.CHANNEL;
            data.pickupStoreCode = event.pathParameters.StoreId;
            data.Name = order.data.items.data[0].firstname + ' ' + order.data.items.data[0].lastname;
            data.FirstName = order.data.items.data[0].firstname;
            data.LastName = order.data.items.data[0].lastname;
            data.email = order.data.items.data[0].email;
            data.ETicket = process.env.ETICKET;
            data.RedCustomerNumber = (order.data.items.data[0].red_customer_id ? order.data.items.data[0].red_customer_id : "");
            data.CustomerTier = order.data.items.data[0].red_customer_tier ? order.data.items.data[0].red_customer_tier : "";
            data.OrderAmount = 0;
            if(event.version != "v1"){
                if(order.data.items.data[0].epayment == 1){
                    data.ApplyBestDeal = "false";
                }else{
                    data.ApplyBestDeal = "true";
                }
                data.CustomerID = new Object();
                if(order.data.items.data[0].travel_document_type && order.data.items.data[0].travel_document){
                    data.CustomerID[order.data.items.data[0].travel_document_type]= order.data.items.data[0].travel_document;
                }
                if(order.data.items.data[0].cpf ){
                    data.CustomerID['CPF'] = order.data.items.data[0].cpf;
                }
            }
            order.OrderAmount = 0;
            order.data.items.data[0].items.forEach(function (element) {
                order.OrderAmount += parseFloat(element.row_total, 10);
            });
            data.OrderAmount = parseFloat(order.OrderAmount).toFixed(4);
            order.OrderAmountPaid = parseFloat(order.data.items.data[0].payment_confirmed_amount?order.data.items.data[0].payment_confirmed_amount:"0.00").toFixed(4);
            data.Currency = order.data.items.data[0].currency;
            if (data.status == "ready" || data.status == "pending") {
                data.Modifiable = "1";
            } else {
                data.Modifiable = "0";
            }
            var statusComplete = process.env.STATUS_COMPLETE.split(',');
            var statusCheck = statusComplete.includes(data.status);
            flagPaid = statusCheck;
            console.log("flagPaid");
            console.log(flagPaid);
            if (epayment) {
                data.ePayment = "1";
                var transaction;
                if (flagPaid) {
                    data.Payments.MerchantId = "DUFRY";
                    data.Payments.MerchantReference = event.pathParameters.OrderId;
                    data.Payments.TransactionId = "";
                    data.Payments.TxDateTime = order.data.items.data[0].created_at;
                    data.Payments.Amount = order.data.items.data[0].total_paid;
                    data.Payments.Currency = order.data.items.data[0].order_currency_code;
                    data.Payments.AuthorizationCode = "";
                    data.Payments.CardNumber = "";
                    data.Payments.CardExpiryDate = "";
                    
                    if (transaction && transaction[0] && transaction[0].additional_information) {
                        data.Payments.TransactionId = transaction[0].txn_id;
                        data.Payments.TxDateTime = transaction[0].created_at;
                        if (transaction[0].additional_information.transaction && transaction[0].additional_information.transaction.authorizationCode) {
                            data.Payments.AuthorizationCode = transaction[0].additional_information.transaction.authorizationCode;
                        }
                        if (transaction[0].additional_information && transaction[0].additional_information.adyen_auth_code) {
                            data.Payments.AuthorizationCode = transaction[0].additional_information.adyen_auth_code;
                        }
                        if (transaction[0].additional_information.stateData && transaction[0].additional_information.stateData.paymentMethod && transaction[0].additional_information.stateData.paymentMethod && transaction[0].additional_information.stateData.paymentMethod.holderName) {
                            data.Payments.CardHolderName = transaction[0].additional_information.stateData.paymentMethod.holderName;
                        }
                        data.Payments.CardNumber = transaction[0] && transaction[0].additional_information.adyen_card_bin + "XXX";
                        data.Payments.CardExpiryDate = transaction[0].additional_information.adyen_expiry_date;
                    }
                }
                else {
                    delete data.Payments;
                    data.OrderAmountPaid = parseFloat(order.data.items.data[0].total_paid).toFixed(4);
                }
            } else {
                delete data.Payments;
                data.ePayment = "0";
            }
            var parent_mapping = Object();

            order.data.items.data.forEach(function (item) {
                item.items.forEach(function (order_item, i) {
                    var item = JSON.parse(itemTemplate).item;

                    defaultAdv = "";
                    /******* Test debug purpose and will be in local for testing. will not be pused to git ********/
                    //data.status  = "ready";
                    //flagPaid = false;
                    /******* Test debug purpose and will be in local for testing. will not be pused to git ********/
                    if (flagPaid) {
                        item.Qty = order_item.qty_paid?order_item.qty_paid:"0.00";
                    } else if (data.status == "ready") {
                        item.Qty = order_item.qty_confirmed?order_item.qty_confirmed:"0.00";
                    } else {
                        item.Qty = order_item.qty_ordered;
                    }

                    item.QtyShipped = order_item.qty_confirmed?order_item.qty_confirmed:"0.00";
                    if(parseFloat(order_item.qty_shipped) > 0 ){
                        gamma_shipped = true;
                    }

                    item.QtyInvoiced = order_item.qty_paid?order_item.qty_paid:"0.00";
                    if(parseFloat(order_item.qty_invoiced) > 0){
                        gamma_invoiced = true;
                    }

                    item.QtyCanceled = order_item.qty_canceled?order_item.qty_canceled:"0.00";
                    if(parseFloat(order_item.qty_canceled) > 0){
                        gamma_canceled = true;
                    } 

                    //*********** DAP-774 New conditions for considering OMS discount values *****/
                    let res_discount_amount  = "0.00";
                    let oms_promotion_discount_value = parseFloat(order_item.promotion_discount_value).toFixed(2);
                    let oms_discount_amount = parseFloat(order_item.discount_ammount).toFixed(2);
                    
                    if(oms_promotion_discount_value > 0 ){
                        res_discount_amount = oms_promotion_discount_value;
                    }else if(oms_discount_amount >= 0){
                        res_discount_amount = oms_discount_amount;
                    }

                   
                    // This fix is for DAP-764 & DAP-771 getting line item row total & discount amount from OMS.
                    if(item.Qty > 0){
                        item.RowTotal = parseFloat(order_item.row_total).toFixed(2); //DAP-764
                        item.DiscountAmount = res_discount_amount; //DAP-771 & DAP - 774
                    }else{
                        item.RowTotal = "0.00";
                        item.DiscountAmount = "0.00";
                    }                 
                    item.Price = order_item.price;

                    if (item.DiscountAmount > 0) {
                        defaultAdv = "ADV999999999";
                    }

                    item.LocalItemCode = order_item.gamma_code;
                    item.GlobalItemCode = order_item.sku;
                    item.QtyOrdered = order_item.qty_ordered;

                    if(order_item.comission != null && order_item.comission != "" ){
                        item.SalesmanCode = order_item.comission;
                    }else{
                        item.SalesmanCode = "0";
                    }
                    

                    item.AppliedRuleAdv = (order_item.promotion_code ? order_item.promotion_code : defaultAdv);
                    if(aggregatedADVCode != ""){
                        aggregatedADVCode += ","+item.AppliedRuleAdv;
                    }else{
                        aggregatedADVCode = item.AppliedRuleAdv;
                    }
                    data.Items.push(item);
                    return;
                });
                return;
            });

            //data.AppliedRuleAdv = order.data.items.data[0].map(e => e.applied_ruleadv).filter(Boolean).join(",");
            
            data.AppliedRuleAdv = (order.data.items.data[0].applied_ruleadv != ""? order.data.items.data[0].applied_ruleadv : aggregatedADVCode != "" || aggregatedADVCode != ","? aggregatedADVCode : "");

            
            if (order.data.items.data[0].shipping_amount > 0) {

                var ERPShippingSku = "";

                var erp = event.requestContext.authorizer.erp;
                erp = erp.toLowerCase();

                var companyCode = event.requestContext.authorizer.companyCode;
                companyCode = companyCode.toLowerCase();
                var ccVal = companyCode.substring(0, 2);
                if (erp == "gamma") {
                    ERPShippingSku = process.env.GAMMA_SHIPPING_SKU;
                }

                console.log("ERPShippingSku");
                console.log(ERPShippingSku);
                               
                var qty_shipped = gamma_shipped == true? "1.000": "0.000";
                var qty_invoiced = gamma_invoiced == true? "1.000": "0.000";
                var qty_canceled = "0.000";
                if(gamma_shipped == false && gamma_invoiced == false && gamma_canceled == true ){
                    qty_canceled = "1.000";
                }
                var shippingOrderItem = "";
                var shippingOrderItem = {"base_price":String(order.data.items.data[0].shipping_amount), "Qty": "1.000","QtyOrdered": "1.000","QtyShipped": qty_shipped,"QtyInvoiced":qty_invoiced,"QtyCanceled": qty_canceled ,"row_total_incl_tax":order.data.items.data[0].shipping_amount+order.data.items.data[0].shipping_tax_amount ,"sku": ERPShippingSku ,"product" : {"sap_code": ERPShippingSku, "local_code": ERPShippingSku} ,"tax_amount": order.data.items.data[0].shipping_tax_amount.toFixed(2),"tax_percent": Number(100*order.data.items.data[0].shipping_tax_amount/order.data.items.data[0].shipping_amount).toFixed(4),"tax_invoiced": +String(order.data.items.data[0].shipping_tax_amount.toFixed(2)) ,"price_incl_tax": String(order.data.items.data[0].shipping_amount+order.data.items.data[0].shipping_tax_amount),"price": String(order.data.items.data[0].shipping_amount)};
                data.Items.push(shippingOrderItem);
            }

        } else {
            data = "";
        }

        var json = { lang: event.headers.posLanguage, message: "Welcome $1 at DUFRY R&C Pickup service. Thank you for shopping with us", url: "getorders", user: data.FirstName };
        success = true;

        var message = traduction.getTraducedWord(json);
        var response = {
            "success": success,
            "message": message,
            "data": data
        }
        return JSON.stringify(response);
    } catch (e) {
        var json = { lang: event.headers.posLanguage, message: e.message ? e.message : 'Error: An unexpected error happened' };
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
