const { DataPipeline } = require('aws-sdk');
var BaseModel = require('../../../../../lib/base.js'),
    util = require('util'),
    apilib = require('../../../../../lib/api.js'),
    filter = require('../../../../../lib/filter.js'),
    status = require('../../../../../lib/omsstatus.js'),
    traduction = require('../../../../../lib/traduction.js');
var entity_id;
var initialEvent = "";
var magentoStoreCode = "";
var bd = new Object();
var increment_id;
var statusPrePaid;
var lang;
var captureGlobal;
var oms_order_id;
var total_due;
var total_paid;
var travel_document_val = "";
var travel_document_type_val = "";
var transaction_id;
var credit_card_type;
var orderIncrementId;

var oms_host_domain = process.env.OMS_API_URL;
var oms_auth_key = process.env.OMS_AUTH_KEY;

function post() {
    post.super_.apply(this, arguments);
}

post.super_ = BaseModel;

util.inherits(post, BaseModel);

//REWRITE THE BASE BEHAVIOR
post.prototype.pre = async function (event, context, forward) {
    var post_data = { filters: [] };
    this._pre(event, context);
    magentoStoreCode = event.app.authorizer.magentoStoreCode;
    //var magentoWHCode = event.app.authorizer.magentoWHCode;
    if (magentoStoreCode != "") {
        magentoStoreCode = "/" + magentoStoreCode;
    }
    if (event.headers.posLanguage != undefined && event.headers.posLanguage != "") {
        lang = event.headers.posLanguage;
    } else {
        lang = process.env.LANGUAGE_DEFAULT;
    }

    initialEvent = event;    

    api = new apilib(oms_host_domain, this.getpath(event), "GET", oms_auth_key, post_data, function () { }, this.onerror, this);
    aux = await api.call();


    //Decide if the order comes from Magento with payment or not.

    //If yes call invoice api for it


    var aux = JSON.parse(aux);

    var res = new Object();
    if (aux.data.size != 1) {

        res.statusCode = 404;
        var e = new Object();
        e.message = "Error: The order requested doesn’t exist";
        post.prototype.onerror(res, e);
        return;
    }
    orderIncrementId = "";
    oms_order_id = aux.data.items.data[0].id;
    customer_email = aux.data.items.data[0].email;
    statusPrePaid = aux.data.items.data[0].status;
    orderIncrementId = aux.data.items.data[0].increment_id;
    travel_document_val = aux.data.items.data[0].travel_document;
    travel_document_type_val = aux.data.items.data[0].travel_document_type;
    if (aux.data && typeof aux.data.items && aux.data.items.data && aux.data.items.data[0].items) {
        entity_id = aux.data.items.data[0].id;
        bd.entity = new Object();
        bd.entity.increment_id = event.pathParameters.OrderId;
        bd.entity.entity_id = entity_id;

        try {
            forward(res);
        } catch (e) {
            res.statusCode = e.statusCode ? e.statusCode : 500;
            post.prototype.onerror(res, e);
        }
    }

}

post.prototype.forward = async function (event) {
    if (event.body !== null) {
        post_data = event.body;
    }
    if (orderIncrementId != null) {
        //Read Magento Order
        var api = new apilib(event.app.authorizer.StoreId, event.app.mag_api_path + '/dufry-oms/orderlist?' + filter.filterQuery('increment_id', orderIncrementId, 'eq', 0, 0) + '&fields=items[items[status,entity_id,total_due,base_total_qty_ordered,customer_email,total_qty_ordered,order_items[parent_item_id,product_type,product_options,qty_ordered,qty_shipped,qty_invoiced,sku,item_id,product[sap_code,local_code]]]]', 'GET', event.app.authorizer.authorization, '', function () { }, onerror);
        mage_order = await api.call();

        var aux = JSON.parse(mage_order);
        if (aux.items[0].items === null) {
            var res = Object();
            res.statusCode = 404;
            var e = new Object();
            var res = new Object();
            e.message = "Error: The order requested doesn’t exist";
            post.prototype.onerror(res, e);
            return;
        }
        total_paid = aux.items[0].items[0].total_paid;
        total_due = aux.items[0].items[0].total_due;
        credit_card_type = "";
        customer_email = aux.items[0].items[0].customer_email;
        statusPrePaid = aux.items[0].items[0].status;
        if (aux.items && typeof aux.items[0] !== undefined && aux.items[0].items && typeof aux.items[0].items[0] !== undefined && aux.items[0].items[0].order_items) {
            entity_id = aux.items[0].items[0].entity_id;
            bd.entity = new Object();
            bd.entity.increment_id = increment_id;
            bd.entity.entity_id = entity_id;
            var middlelist = Object();

            aux.items[0].items[0].order_items.forEach(function (aux) {
                if (event.requestContext.authorizer.erp == "SAP") {
                    if (aux.parent_item_id != null) {
                        middlelist[aux.product.sap_code] = aux.parent_item_id;
                    } else if (aux.product_type == "simple") {
                        middlelist[aux.product.sap_code] = aux.item_id;
                    }
                } else {
                    if (aux.product.local_code != undefined) {
                        if (aux.parent_item_id != null) {
                            middlelist[aux.product.local_code] = aux.parent_item_id;
                        } else if (aux.product_type == "simple") {
                            middlelist[aux.product.local_code] = aux.item_id;
                        }
                    } else {

                        if (aux.parent_item_id != null) {
                            middlelist[aux.product.sap_code] = aux.parent_item_id;
                        } else if (aux.product_type == "simple") {
                            middlelist[aux.product.sap_code] = aux.item_id;
                        }
                    }
                }
            });
            try {
                var body = JSON.parse(event.body);
                var bodyTemplate = "{\"items\":[], \"capture\":\"\"}";
                var itemTemplate = "{\"order_item_id\": \"\",\"qty\": 0}";
                var invoiceBody = JSON.parse(bodyTemplate);
                var capture = true;
                if (body.capture === false || body.Capture === false) {
                    capture = false;
                }
                captureGlobal = capture;
                body.Items.forEach(function (aux) {
                    tmpItem = JSON.parse(itemTemplate);
                    if (middlelist[aux['LocalItemCode']] == undefined) {
                        //   throw({'message':"Error: Items sent do not match", 'statusCode':'404'});
                    }
                    tmpItem.order_item_id = middlelist[aux['LocalItemCode']];
                    tmpItem.qty = aux['Qty'] * 1;
                    invoiceBody.items.push(tmpItem);
                });


                invoiceBody.capture = capture;


                event.body = JSON.stringify(invoiceBody);
                //TODO si el body no tiene productos, adelantarnos al error.
            } catch (e) {
                res.statusCode = e.statusCode ? e.statusCode : 500;
                post.prototype.onerror(res, e);
            }
        }


        //Picking
        api1 = new apilib(event.app.authorizer.StoreId, this.pathShipment(event), event.httpMethod, event.app.authorizer.authorization, event.body, function () { }, post.prototype.onerror, this);
        var first = await api1.call();
        console.log(JSON.stringify(first));

        //Invoicing
        api2 = new apilib(event.app.authorizer.StoreId, this.path(event), event.httpMethod, event.app.authorizer.authorization, event.body, post.prototype.ondata, post.prototype.onerror, this);
        var second = api2.call();
    }
    else {
        post.prototype.ondata({ statusCode: 200 }, "", this);
    }
};

post.prototype.getpath = function (event) {
    var hfmCode = "";
    let url = "";
    let index = 0;
    if(event?.requestContext?.authorizer?.hfmCode){
        hfmCode = event.requestContext.authorizer.hfmCode;
    }       
    url = "/api/v1/"+hfmCode+"/orders";

    //apply OMS filters as query string    
    url = filter.applyOmsLocationFilter(event,url,index);
    url = filter.applyOmsTerminalFilter(event,url,index);
    url = filter.applyOmsOrderIdFilter(event,url,index);   
    return url;
};

post.prototype.getPaymentpath = function (event) {
    var hfmCode = "";
    if(event?.requestContext?.authorizer?.hfmCode){
        hfmCode = event.requestContext.authorizer.hfmCode;
    }
    return "/api/v1/" + hfmCode + "/orders";
};

post.prototype.path = function (event) {
    var path = '/order/' + entity_id + '/invoice';
    return event.app.mag_api_path + path;
};

post.prototype.pathShipment = function (event) {
    var path = '/order/' + entity_id + '/ship';
    return event.app.mag_api_path + path;
};

post.prototype.pathCancel = function (event) {
    var path = '/orders/' + entity_id + '/cancel';
    return event.app.mag_api_path + path;
};

post.prototype.chunk = async function (chunk, event, res) {
    try {
        var id_type = "increment_id";
        var response;
        if (event.headers.posLanguage != undefined && event.headers.posLanguage != "") {
            lang = event.headers.posLanguage;
        } else {
            lang = process.env.LANGUAGE_DEFAULT;
        }
        var orderid = event.pathParameters.OrderId;
        if (res.statusCode != 200) {
            var json = { lang: lang, message: "Order $4 has NOT been paid. The order is no eligible to be paid or the order was already paid", orderid: event.pathParameters.OrderId, currency: "", amount: "" };
            var message = traduction.getTraducedWord(json);
            response = {
                "success": false,
                "message": message,
                "data": "",
                "requestId": global.requestId,
            }
            return JSON.stringify(response);
        }

        //BEGIN STATUS CHANGE IN OMS
        var newStatus = process.env.PAYMENT_NEWSTATUS;
        var body = JSON.parse(event.body);
        if (body.capture) {
            commentText = "Online payment requested from POS";
        } else {
            commentText = "Offline payment confirmed from POS";
        }
        if (orderIncrementId != null) {
            var api = new apilib(event.app.authorizer.StoreId, event.app.mag_api_path + '/orders/' + entity_id + '/comments', 'POST', event.app.authorizer.authorization, "{\"statusHistory\": {\"comment\": \"" + commentText + "\",\"status\": \"" + newStatus + "\"}}", function () { }, post.prototype.onerror);
            var a = api.call();
        }
        //END STATUS CHANGE

        //check if it was succesfully paid
        post_data1 = { "status": "complete", "payment_status": "confirmed", "payment_transaction_id": transaction_id, "payment_authorized_amount": 0, "payment_confirmed_amount": total_paid, "payment_id": null };
        var api3 = new apilib(oms_host_domain, this.getpath(event) + "/" + oms_order_id, 'PUT', oms_auth_key, JSON.stringify(post_data1), function () { }, onerror);
        var xxxx = await api3.call();
        if (orderIncrementId != null) {
            var api4 = new apilib(event.app.authorizer.StoreId, this.pathCancel(event), 'POST', event.app.authorizer.authorization, '', function () { }, onerror);
            var c = await api4.call();

            var api2 = new apilib(event.app.authorizer.StoreId, event.app.mag_api_path + '/dufry-oms/orderlist?' + filter.filterQuery(id_type, orderIncrementId, 'eq', 0, 0) + '', 'GET', event.app.authorizer.authorization, '', ondata2, onerror);
            var b = await api2.call();
        }else{
            var json = { lang: lang, message: "The order $4 has been confirmed.", orderid: oms_order_id};
            var message = traduction.getTraducedWord(json);      

            response = {
                "success": true,
                "message": message,
                "data": ""
            }

        }

 

        function ondata2(res, chunk, event) {
            try {
                var order = JSON.parse(chunk);
                var dataTemplate;
                if (event.version == "v1") {
                    dataTemplate = "{\"data\":{\"incrementId\":\"\",\"retrievalDate\":\"\",\"status\":\"\",\"statusMagento\":\"\",\"channel\":\"\", \"pickupStoreCode\":\"\", \"Name\":\"\", \"FirstName\": \"\", \"LastName\":\"\", \"email\":\"\", \"ETicket\":\"\", \"RedCustomerNumber\":\"\", \"Modifiable\":\"\", \"OrderAmount\":\"\", \"Currency\":\"\", \"Items\":[], \"Payments\":{\"Amount\":\"\",\"MerchantId\":\"\",\"MerchantReference\":\"\",\"AuthorizationCode\":\"\",\"CardNumber\":\"\",\"CardExpiryDate\":\"\",\"CardHolderName\":\"\",\"TransactionId\":\"\",\"TxDateTime\":\"\",\"Currency\":\"\"}}}";
                } else {
                    dataTemplate = "{\"data\":{\"incrementId\":\"\",\"retrievalDate\":\"\",\"status\":\"\",\"statusMagento\":\"\",\"channel\":\"\", \"pickupStoreCode\":\"\", \"Name\":\"\", \"FirstName\": \"\", \"LastName\":\"\", \"email\":\"\", \"ETicket\":\"\", \"RedCustomerNumber\":\"\", \"Modifiable\":\"\", \"OrderAmount\":\"\", \"Currency\":\"\", \"ApplyBestDeal\":\"\", \"CustomerID\":\"\", \"Items\":[], \"Payments\":{\"Amount\":\"\",\"MerchantId\":\"\",\"MerchantReference\":\"\",\"AuthorizationCode\":\"\",\"CardNumber\":\"\",\"CardExpiryDate\":\"\",\"CardHolderName\":\"\",\"TransactionId\":\"\",\"TxDateTime\":\"\",\"Currency\":\"\"}}}";
                }
                var itemTemplate = "{\"item\":{\"LocalItemCode\":\"\",\"GlobalItemCode\":\"\",\"Qty\":\"\",\"QtyOrdered\":\"\",\"QtyShipped\":\"\",\"QtyInvoiced\":\"\",\"QtyCanceled\":\"\", \"Price\":\"\",\"RowTotal\":\"\"}}";
                var data = JSON.parse(dataTemplate).data;

                if (order.items && order.items[0] && order.items[0].items) {
                    var flagPaid = false;
                    var flagCapture = false;
                    data.incrementId = initialEvent.pathParameters.OrderId;
                    data.retrievalDate = order.items[0].items[0].retrieval_date;
                    var statusTable = status.statusTable();
                    orderStatus = statusTable.filter(obj => {
                        return obj.split('|')[0] == order.items[0].items[0].status
                    })
                    data.status = (orderStatus && orderStatus[0]) ? orderStatus[0].split('|').pop() : "";
                    data.statusMagento = order.items[0].items[0].status;
                    data.channel = process.env.CHANNEL;
                    data.pickupStoreCode = initialEvent.pathParameters.StoreId;
                    data.Name = order.items[0].items[0].customer_firstname + ' ' + order.items[0].items[0].customer_lastname;
                    data.FirstName = order.items[0].items[0].customer_firstname;
                    data.LastName = order.items[0].items[0].customer_lastname;
                    data.email = order.items[0].items[0].customer_email;
                    data.ETicket = process.env.ETICKET;
                    data.RedCustomerNumber = (order.items[0].items[0].customer_red_number ? order.items[0].items[0].customer_red_number : "");
                    data.OrderAmount = order.items[0].items[0].total_paid;
                    data.Currency = order.items[0].items[0].order_currency_code;
                    if (event.version != "v1") {
                        data.ApplyBestDeal = "False";
                        DataPipeline.CustomerID = new Object();
                        if (order.items[0].items[0].travel_document_type && order.items[0].items[0].travel_document) {
                            data.CustomerID[order.items[0].items[0].travel_document_type] = order.items[0].items[0].travel_document;
                        }
                        if (order.items[0].items[0].cpf) {
                            data.CustomerID["CPF"] = order.items[0].items[0].cpf;
                        }
                    }
                    if (data.status == "ready" || data.status == "pending") {
                        data.Modifiable = "1";
                    } else {
                        data.Modifiable = "0";
                    }
                    if (order.items[0].items[0].transactions) {
                        var transaction = order.items[0].items[0].transactions.filter(obj => {
                            return (obj.txn_type === 'capture');
                        });
                        var statusComplete = process.env.STATUS_COMPLETE.split(',');
                        var statusCheck = statusComplete.includes(data.status);
                        flagPaid = statusCheck;

                        if (transaction) {
                            data.Payments.MerchantId = "DUFRY";
                            data.Payments.MerchantReference = initialEvent.pathParameters.OrderId;
                            data.Payments.TransactionId = "";
                            data.Payments.TxDateTime = "";
                            data.Payments.Amount = order.items[0].items[0].charged_total;
                            data.Payments.AuthorizationCode = "";
                            data.Payments.CardNumber = "";
                            data.Payments.CardExpiryDate = "";
                            data.Payments.Currency = order.items[0].items[0].charged_currency;

                            if (transaction[0] && transaction[0].additional_information) {
                                data.Payments.TransactionId = transaction[0].txn_id;
                                data.Payments.TxDateTime = transaction[0].created_at;
                                data.Payments.AuthorizationCode = transaction[0].additional_information.pspReference;
                                data.Payments.CardNumber = transaction[0].additional_information.adyen_card_bin;
                                data.Payments.CardExpiryDate = transaction[0].additional_information.adyen_expiry_date;
                                data.Payments.CardHolderName = "";
                                data.Payments.Currency = order.items[0].items[0].charged_currency;
                                if (transaction[0] && transaction[0].additional_information) {
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
                                    if (data.Payments.CardHolderName == "" && transaction[0].additional_information && transaction[0].additional_information.additionalData && transaction[0].additional_information.additionalData.cardHolderName) {
                                        data.Payments.CardHolderName = transaction[0].additional_information.additionalData.cardHolderName;
                                    }
                                    if (data.Payments.CardHolderName == "" && transaction[0].additional_information && transaction[0].additional_information.additionalData && transaction[0].additional_information.additionalData.cardHolderName) {
                                        data.Payments.CardHolderName = transaction[0].additional_information.additionalData.cardHolderName;
                                    }

                                    data.Payments.CardNumber = transaction[0] && transaction[0].additional_information.adyen_card_bin + "XXX";

                                    data.Payments.CardExpiryDate = transaction[0].additional_information.adyen_expiry_date;
                                }
                            }
                        }
                        else {
                            delete data.Payments;
                            data.OrderAmount = "0";
                        }
                    } else {

                        delete data.Payments;
                        data.OrderAmount = "0";
                    }
                    var parent_mapping = Object();
                    order.items[0].items.forEach(function (item) {
                        item.order_items.forEach(function (order_item, i) {
                            if (order_item.product_type != "configurable") return;
                            parent_mapping[order_item.item_id] = order_item;
                        })
                    });

                    order.items[0].items.forEach(function (item) {
                        item.order_items.forEach(function (order_item, i) {
                            var item = JSON.parse(itemTemplate).item;
                            if (order_item.product_type != "simple") return;
                            item.LocalItemCode = order_item.product.local_code;
                            item.GlobalItemCode = order_item.product.sap_code;
                            var statusTable = status.statusTable();
                            var myOrderStatus = statusTable.filter(obj => {
                                return obj.split('|')[0] == statusPrePaid
                            })
                            var statusPP = (myOrderStatus && myOrderStatus[0]) ? myOrderStatus[0].split('|').pop() : "";

                            item.QtyOrdered = order_item.qty_ordered;

                            item.Price = order_item.price;
                            if (order_item.parent_item_id) {
                                item.RowTotal = (parseFloat(parent_mapping[order_item.parent_item_id].row_total) - parseFloat(parent_mapping[order_item.parent_item_id].discount_amount)).toFixed(4);
                                item.DiscountAmount = (item.Qty / order_item.qty_ordered * parent_mapping[order_item.parent_item_id].discount_amount).toFixed(4);
                                item.QtyShipped = parent_mapping[order_item.parent_item_id].qty_shipped;
                                item.QtyInvoiced = parent_mapping[order_item.parent_item_id].qty_invoiced;
                                item.QtyCanceled = parent_mapping[order_item.parent_item_id].qty_canceled;
                                if (statusPP == "pending") {
                                    item.Qty = parent_mapping[order_item.parent_item_id].qty_ordered;
                                } else if (statusPP == "ready") {
                                    item.Qty = parent_mapping[order_item.parent_item_id].qty_shipped;
                                } else if (statusPP == "complete" || statusPP == "cancel") {
                                    item.Qty = parent_mapping[order_item.parent_item_id].qty_invoiced;
                                }
                                if (parent_mapping[order_item.parent_item_id].original_price != parent_mapping[order_item.parent_item_id].price) {
                                    item.DiscountAmount = (item.Qty / order_item.qty_ordered * (parent_mapping[order_item.parent_item_id].original_price - parent_mapping[order_item.parent_item_id].price)).toFixed(4);
                                }
                            } else {
                                item.RowTotal = (parseFloat(order_item.row_total) - parseFloat(order_item.discount_amount)).toFixed(4);
                                item.QtyShipped = order_item.qty_shipped;
                                item.QtyInvoiced = order_item.qty_invoiced;
                                item.QtyCanceled = order_item.qty_canceled;
                                if (statusPP == "pending") {
                                    item.Qty = order_item.qty_ordered;
                                } else if (statusPP == "ready") {
                                    item.Qty = order_item.qty_shipped;
                                } else if (statusPP == "complete" || statusPP == "cancel") {
                                    item.Qty = order_item.qty_invoiced;
                                }
                                if (order_item.original_price != order_item.price) {
                                    item.DiscountAmount = (item.Qty / order_item.qty_ordered * (order_item.original_price - order_item.price)).toFixed(4);
                                }
                            }
                            data.Items.push(item);
                            return;
                        });
                        return;
                    });
                }
                else {
                    data = "";
                }

                var amount = order.items[0].items[0].total_invoiced;
                var currency = order.items[0].items[0].charged_currency ? order.items[0].items[0].charged_currency : data.Currency;

                var json = { lang: lang, message: "The order $4 has been paid. The total amount capture is $5 $6", orderid: orderid, currency: currency, amount: amount.toFixed(2) };
                var message = traduction.getTraducedWord(json);
                response = {
                    "success": true,
                    "message": message,
                    "data": data
                }
                return JSON.stringify(response);
            } catch (e) {
                var json = { lang: lang, message: 'Order has NOT been paid. An unexpected error happened' };
                var message = traduction.getTraducedWord(json);
                response = {
                    "success": false,
                    "message": message,
                    "data": "",
                    "requestId": global.requestId,
                }
                return JSON.stringify(response);
            }
        }
        //TODO controlar error 
        return JSON.stringify(response);
    } catch (e) {

        var json = { lang: lang, message: 'Order has NOT been paid. An unexpected error happened' };
        var message = traduction.getTraducedWord(json);
        response = {
            "success": false,
            "message": message,
            "data": "",
            "requestId": global.requestId,
        }
        return JSON.stringify(response);
    }
}

function onerror(res, e) {
    status = res.statusCode ? res.statusCode : 'Order has NOT been paid. An unexpected error happened';

    var json = { lang: lang, message: status, url: "payment" };
    var message = traduction.getTraducedWord(json);
    response = {
        "success": false,
        "message": message,
        "data": "",
        "requestId": global.requestId,
    }
    return JSON.stringify(response);
};

module.exports = post;
