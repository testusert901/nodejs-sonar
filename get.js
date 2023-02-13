var BaseModel = require('../../lib/magento.js'),
    util = require('util'),
    apilib = require('../../lib/api.js'),
    taxJurisdiction = require('../../lib/taxJurisdiction.js'), 
    validator = require('../../lib/validator.js'),   
    filter = require('../../lib/filter.js');
var event;
var order_date = "";
var erp;

//*********Invoice Validations************ 
const DECIMAL_MARGIN = 0.01
var check_invoice_total_val1 = 0;
var check_invoice_total_val2 = 0;
var check_charged_rate = 0;
var check_discount_amount = 0;
var diff_invoice_total = 0;
var skipInvoice = false;
//*********Invoice Validations************

function get() {
    event = arguments[0];
    get.super_.apply(this, arguments);
}

get.super_ = BaseModel;

util.inherits(get, BaseModel);

get.prototype.pre = function (event, context) {
    console.log("event -invoice");
    console.log(JSON.stringify(event));
    this._pre(event, context);
    
    var api = new apilib(event.app.authorizer.store_identifier, transactionPath(event), 'GET', event.app.authorizer.authorization, '', get.prototype.ondata, this.onerror, get.prototype);
    api.call();    

    function transactionPath(event) {
        return '/rest/V1/dufry-oms/orderlist' + '?pick_date=' + event.app.queryfilter.created_at + '&' + event.app.filters + '&' + filter.storeFilterQuery(event.requestContext.authorizer.storeCode, event.requestContext.authorizer.isSinglePickUpPoint, event.requestContext.authorizer.storeIds, 5, 0) + '&' + filter.filterQuery('status', 'payment_review,pending_payment,wh_ready', 'nin', 6, 0) + '&' + filter.paginationQueryOms(event.app.queryfilter.page, event.app.queryfilter.pagesize);
    }
   
}

get.prototype.chunk = async function (chunk) {
    var invoices = JSON.parse(chunk);
    if (event.app.queryfilter.attributes == "*") {
        return chunk;
    }
    if (invoices.items && invoices.items[0] && invoices.items[0].items) {

        var parent_mapping = Object();
        invoices.items[0].items.forEach(function (item) {
            item.order_items.forEach(function (order_item, i) {
               if (order_item.product_type != "configurable") return;
                parent_mapping[order_item.item_id] = order_item;
            })
        });       

        invoices.items[0].items.forEach(function (item) {
            item.AppliedRuleAdv = item.order_items.map(e => e.applied_rule_adv).filter(Boolean).join(",");
            item.AppliedRuleAdv = (item.AppliedRuleAdv != "," ? item.AppliedRuleAdv : "");
            
            item.order_items.forEach(function (order_item, i) {   
                var defaultAdv = "";
                if (order_item.parent_item_id) {
                    order_item.RowTotal = (parseFloat(parent_mapping[order_item.parent_item_id].row_total) - parseFloat(parent_mapping[order_item.parent_item_id].discount_amount)).toFixed(4);
                    order_item.row_total = order_item.RowTotal;
                    order_item.DiscountAmount = parent_mapping[order_item.parent_item_id].discount_amount;
                    if (parent_mapping[order_item.parent_item_id].original_price != parent_mapping[order_item.parent_item_id].price) {
                        order_item.DiscountAmount = (parent_mapping[order_item.parent_item_id].original_price - parent_mapping[order_item.parent_item_id].price).toFixed(2);
                    }

                } else {                                               
                        order_item.RowTotal = (parseFloat(order_item.row_total) - parseFloat(order_item.discount_amount)).toFixed(4);
                        order_item.DiscountAmount = order_item.discount_amount;
                        if (order_item.original_price != order_item.price) {
                            order_item.DiscountAmount = (order_item.original_price - order_item.price).toFixed(2);
                        }
                }
                if(order_item.DiscountAmount > 0){
                    defaultAdv = "ADV999999999";
                }
                if (order_item.product_type == "configurable"){
                    order_item.AppliedRuleAdv = (order_item.applied_rule_adv ? order_item.applied_rule_adv : defaultAdv);
                }else{
                    order_item.AppliedRuleAdv = (order_item.applied_rule_adv ? order_item.applied_rule_adv : order_item.applied_rule_ids ? order_item.applied_rule_ids : defaultAdv);
                }
                
            });            
        });

        for (const item of invoices.items[0].items) {

            //*********Invoice Validations************
            //checking the condition to skip the invoice
            //initializing variable to zero before processing each invoice items.
            check_invoice_total_val1 = 0;
            check_invoice_total_val2 = 0; 
            check_charged_rate = 0;
            check_discount_amount = 0;
            diff_invoice_total = 0;            
            skipInvoice = false;

            // checking the customer store credit/voucher using the customer_balance_invoiced
            // setting the first part of the condition for invoice total validation
            check_invoice_total_val1 = getInvoiceTotalV1(item, check_invoice_total_val1);
            
            // setting the second part of the condition for invoice total validation
            check_invoice_total_val2 = getInvoiceTotalV2(item); 
            

            // condition for accessing the Brazil currency convertion before the invoice total validation
            if(item.charged_rate != null){
                check_charged_rate = parseFloat(item.charged_rate);
            }else{
                check_charged_rate = 0;
            }            
            console.log("check_charged_rate = "+check_charged_rate);  
            check_invoice_total_val2 = getBrazilCurencyConverson(item, check_invoice_total_val2, check_charged_rate);

            
            //setting the margin of difference for the manual calculation for BRL currency conversion to 0.01
            diff_invoice_total = getInvoiceTotalDiff(item,check_invoice_total_val1,check_invoice_total_val2,check_charged_rate,DECIMAL_MARGIN);        

            console.log("item.total_paid = "+item.total_paid);
            console.log("item.total_invoiced = "+item.total_invoiced);

            // Checking the order subtotal_invoiced , order shipping amount & order discount amount  againt the total paid & balance invoiced(store credit/voucher) from the customer to check whether the invoice is tallyed or not.
            skipInvoice = shouldSkipInvoice(item,check_invoice_total_val1,check_invoice_total_val2,check_charged_rate,diff_invoice_total,DECIMAL_MARGIN);
            if(skipInvoice === true){
                continue;
            }
            //*********Invoice Validations************

            //shipping address details
            item.shipping_address = new Object(); 
            item.shipping_address_postcode = taxJurisdiction.checkPostalCode(item.shipping_address_postcode,event.requestContext.authorizer.country);                       
            item.shipping_address.firstname = item.shipping_address_firstname ? item.shipping_address_firstname.replace(/:/g, "") : "";
            item.shipping_address.lastname = item.shipping_address_lastname ? item.shipping_address_lastname.replace(/:/g, "") : "";
            item.shipping_address.address_street = item.shipping_address_street ? item.shipping_address_street.substring(0, 63).replace(/:/g, "") : "";
            item.shipping_address.address_region = item.shipping_address_region ? item.shipping_address_region.replace(/:/g, "") : "";
            item.shipping_address.city = item.shipping_address_city ? item.shipping_address_city.replace(/:/g, "") : "";
            item.shipping_address.postcode = item.shipping_address_postcode ? item.shipping_address_postcode.replace(/:/g, "") : "";
            item.shipping_address.telephone = item.phone_number;

            item.postcode = taxJurisdiction.checkPostalCode(item.postcode,event.requestContext.authorizer.country); 
            item.tax_jurisdiction = await taxJurisdiction.fetchTaxJurisdictionByPostalCode(item.shipping_address_postcode,event.app.authorizer.country,item.shipping_method =="freeshipping_freeshipping");
            var parent_array = {};
            item.storage_location = "1000";
            item.type_payment = "N";
            var incrementId = "";
            var other_date = item.created_at;
            item.order_date = new Object();
            item.order_date = other_date;
            order_date = item.order_date;
            item.created_at = item.updated_at;
            item.billing_address = new Object();
            item.billing_address.city = item.city;
            item.billing_address.street = item.street?item.street.substring(0,63):"";
            item.billing_address.name = item.customer_firstname + " " + item.customer_lastname;
            item.billing_address.postcode = item.postcode;
            incrementId = item.increment_id;
            item.increment_id = incrementId;
            //item.grand_total = item.shipping_amount;
            item.grand_total = 0;
            console.log("GT - 1");
            console.log(item.grand_total);

            
            var erp = event.requestContext.authorizer.erp;
            erp = erp.toUpperCase();
            
            item.order_items.forEach(function (order_item, idx) {
                if (order_item.qty_shipped == 0) {
                    if (order_item.parent_item_id) {

                        if (erp == "SAP") {

                            parent_array[order_item.parent_item_id] = order_item.product.sap_code;
                        }else{
                            parent_array[order_item.parent_item_id] = order_item.product.local_code;
                        }
                    }
                    delete item.order_items[idx];
                } else {

                    if (erp == "SAP") {
                        if (order_item.product.sap_code) {

                            order_item.sku = order_item.product.sap_code;
                        }else if(order_item.product.local_code ){
                            order_item.sku = order_item.product.local_code;
                        }else{
                            order_item.sku = "";
                        }
                    }else{
                        order_item.sku = order_item.product.local_code;
                    }
                    order_item.tax_amount = order_item.tax_invoiced;

                    order_item.discount_amount = (order_item.qty_shipped * order_item.base_discount_amount) / order_item.qty_ordered;
                    order_item.row_total_incl_tax = (order_item.qty_shipped * (order_item.price*1)+  order_item.tax_amount*1 - order_item.discount_amount*1).toFixed(2);
                    
                    item.grand_total = item.grand_total*1 + order_item.row_total_incl_tax*1;
                    console.log("GT - 3");
                    console.log(item.grand_total);
                    //order_item.row_total_incl_tax = order_item.row_total_incl_tax.toFixed(2);
                    order_item.price = (order_item.base_price - (order_item.base_discount_amount) / order_item.qty_ordered).toFixed(2);
                    order_item.price_incl_tax = (order_item.price_incl_tax - (order_item.base_discount_amount) / order_item.qty_ordered).toFixed(2);
                    delete order_item.discount_amount;
                    delete order_item.product;
                    delete order_item.parent_item_id;
                    delete order_item.qty_ordered;
                    delete order_item.base_discount_amount;
                    delete order_item.applied_rule_adv;
                    delete order_item.row_total;
                    
                }
            })

            item.order_items.forEach(function (order_item, idx) {
                if (parent_array[order_item.item_id]) { //Cover configurable products
                    order_item.sku = parent_array[order_item.item_id];
                }
                delete order_item.item_id;
            })

            item.payment = Array();
            item.transactions.forEach(function (transaction_item, idx) {
                if (transaction_item.txn_type != "capture") {
                   return;
                }

                //adyen payment capture check 
                var payment_method = transaction_item.additional_information.method?transaction_item.additional_information.method:transaction_item.additional_information.method_title;
                if(payment_method == "adyen_cc" ||  payment_method == "Adyen CreditCard"){
                    if(item.transaction_notification != undefined ){
                        if(item.transaction_notification.adyen != undefined ){                    
                            item.transaction_notification.adyen.forEach(function (notification_item, idx) {
                                if(notification_item.event_code != undefined && notification_item.done != undefined ){
                                    if(notification_item.event_code == "CAPTURE" && notification_item.done == 0){
                                        return;                            
                                    }
                                }                                
                            });
                        }
                    }                    
                    if(item.total_paid == 0){
                        return;
                    }
                }
                
                //After processing, removing the transaction notification from the api response.
                delete item.transaction_notification;

                var cc_type = "";
                var type_card = "";
                var terminal = "";
                var credit_card_number = transaction_item.cc_last_4;
                if(!credit_card_number){
                    credit_card_number = transaction_item.additional_information.card_number?transaction_item.additional_information.card_number:transaction_item.additional_information.adyen_card_bin;
                }
            
                switch(transaction_item.additional_information.method?transaction_item.additional_information.method:transaction_item.additional_information.method_title){
                    case "adyen_cc":
                    case "Adyen CreditCard":
                        cc_type = transaction_item.additional_information.cc_type;
                    break;
                    case "authnetcim":
                    case "CC":
                        cc_type = transaction_item.additional_information.card_type;
                        credit_card_number = transaction_item.additional_information.acc_number;
                    break;
                    case "tns_hpf":
                        cc_type =  transaction_item.additional_information.card_scheme;    
                    break;
                    case "checkmo":
                    case "free":
                    case "cashondelivery":                      
                    default:
                        cc_type = transaction_item.additional_information.card_scheme?transaction_item.additional_information.card_scheme:"";
                };
                switch (cc_type.toUpperCase()) {
                    case "AMERICANEXPRESS":
                    case "AMEX":
                    case "AE":
                        type_card = "AMEX";
                        break;    
                    case "VI":
                    case "VISA":
                        type_card = "VISA";
                        break;
                    case "MASTERCARD":
                    case "MC":
                        type_card = "MC";
                        break;
                    case "DISCOVER":
                        type_card = "POST";
                        break;
                    default:
                        type_card = transaction_item.additional_information.card_scheme;
                }
                if (transaction_item.additional_information.transaction && transaction_item.additional_information.transaction.terminal) {
                    terminal = transaction_item.additional_information.transaction.terminal;
                } else {
                    terminal = "0001";
                }
                var total_paid = item.total_paid;

                //Setting the type_card to null, when it is undefined.
                if(type_card == undefined){ type_card = "null";}

                item.payment.push({
                    "type_card": type_card, "card_number": credit_card_number,
                    "terminal_id": terminal, "authorization_code": transaction_item.txn_id, "authorization_date": order_date,"amount": total_paid.toFixed(2)+""
                });
            })
           

            if(item.customer_balance_invoiced>0){  
                item.payment.push({ "type_card": process.env.VOUCHER_CC_TYPE, "card_number": "XXXXXXXX", "terminal_id":"", "authorization_code":"", "authorization_date":"","amount":  item.customer_balance_invoiced});
            }

            //console.log("Item");
            //console.log(JSON.stringify(item));
            console.log("len 1");
            if (event.requestContext.authorizer.isSinglePickUpPoint) { //voucher only in Emporium
                if (item.total_paid < (item.grand_total + item.shipping_amount)) { //Partial paid with cc and Voucher
                    var total_value = item.grand_total - item.total_paid + item.shipping_amount;
                    item.payment.push({ "type_card": process.env.VOUCHER_CC_TYPE, "card_number": "XXXXXXXX", "terminal_id":"", "authorization_code":"", "authorization_date":"","amount":  total_value.toFixed(2)});
                } else if (item.payment.length == 0) { //Fully paid with Voucher
                    var total_value = item.total_paid;
                    item.payment.push({ "type_card": process.env.VOUCHER_CC_TYPE, "card_number": "XXXXXXXX", "terminal_id":"", "authorization_code":"", "authorization_date":"","amount": total_value.toFixed(2)});
                }
            }
            console.log("len 2");

            if (item.shipping_amount > 0) {

                var ERPShippingSku = "";

                var erp = event.requestContext.authorizer.erp;
                var companyCode = event.requestContext.authorizer.companyCode;

                erp = erp.toLowerCase();
                companyCode = companyCode.toLowerCase();
                var ccVal = companyCode.substring(0, 2);

                if(erp == "gamma"){
                    ERPShippingSku = process.env.GAMMA_SHIPPING_SKU; 
                }
                
                if(erp == "sap" ){
                    if(ccVal == "uk"){
                        ERPShippingSku = process.env.UKSAP_SHIPPING_SKU;
                    }else if(event.requestContext.authorizer.country == "US"){
                        if(item.shipping_tax_amount >0){
                            ERPShippingSku = process.env.USTAX_SHIPPING_SKU;
                        }else{
                            ERPShippingSku = process.env.US_SHIPPING_SKU;
                        }
                    }
                    else{
                        ERPShippingSku = process.env.SAP_SHIPPING_SKU;
                    }
                }

                var shippingOrderItem = {"base_price":String(item.shipping_amount), "qty_shipped": "1.00", "product" : {"sap_code": ERPShippingSku, "local_code": ERPShippingSku},"row_total_incl_tax":item.shipping_amount+item.shipping_tax_amount ,"sku": ERPShippingSku, "tax_amount": item.shipping_tax_amount.toFixed(2),"tax_percent": Number(100*item.shipping_tax_amount/item.shipping_amount).toFixed(4),"tax_invoiced": +String(item.shipping_tax_amount.toFixed(2)) ,"price_incl_tax": String(item.shipping_amount+item.shipping_tax_amount),"price": String(item.shipping_amount)};
                item.order_items.push(shippingOrderItem);

               item.grand_total = item.grand_total +(shippingOrderItem.base_price*shippingOrderItem.qty_shipped);
                console.log("GT - 4");
                console.log(item.grand_total);

            }
            item.grand_total = item.grand_total.toFixed(2);
            console.log("GT - 5");
            console.log(item.grand_total);
            delete item.shipping_method;
            delete item.total_paid;
            delete item.entity_id;
            delete item.customer_firstname;
            delete item.customer_lastname;
            delete item.city;
            delete item.discount_amount;
            delete item.street;
            delete item.transactions;
            delete item.postcode;
            delete item.shipping_amount;
            delete item.applied_rule_ids;
            delete item.phone_number;
            delete item.shipping_address_firstname;
            delete item.shipping_address_lastname;
            delete item.shipping_address_street;
            delete item.shipping_address_region;
            delete item.shipping_address_city;            
            delete item.shipping_address_postcode;
            item.order_items = item.order_items.filter(function (el) {
                return el != null;
            });
        };

        var result = Object();
        result.items = Array();


        //remove not paided lines
        for (const element of invoices.items[0].items){            
            if((element.hasOwnProperty('payment') && element.payment.length > 0) || (element.customer_balance_invoice > 0 )){//*********Invoice Validations************//                
                result.items.push(element);
            }
        }

        return JSON.stringify(result);
    }
    else if(invoices.hasOwnProperty('message') && invoices.message != ""){
        return JSON.stringify(invoices);
    }    
    return "";
};

//*********Invoice Validations************
function discountCalculation(item){
    var check_discount_amt = 0;
    check_discount_amt = 0;
    item.order_items.forEach(function (order_item) {
        if (order_item.qty_shipped != 0) {
            check_discount_amt += (order_item.qty_shipped * order_item.base_discount_amount) / order_item.qty_ordered;
        }
    });
    return check_discount_amt;
}

function getInvoiceTotalV1(item, calc_invoice_total_val1){
    // setting the first part of the condition for invoice total validation
    if(item.customer_balance_invoiced != null){
        calc_invoice_total_val1 = parseFloat(item.total_paid) + parseFloat(item.customer_balance_invoiced);
    }else{
        calc_invoice_total_val1 = parseFloat(item.total_paid);
    }    
    calc_invoice_total_val1 = calc_invoice_total_val1.toFixed(2);    
    return calc_invoice_total_val1;
}

function getInvoiceTotalV2(item){
    var check_discount_amount_val = discountCalculation(item);   
    return parseFloat(item.subtotal_invoiced) + parseFloat(item.shipping_amount) - check_discount_amount_val;
}

function getBrazilCurencyConverson(item, calc_invoice_total_val2,calc_charged_rate){
    if(item.charged_currency == "BRL" && calc_charged_rate > 0){               
        calc_invoice_total_val2 = ((calc_invoice_total_val2) * (calc_charged_rate));
        calc_invoice_total_val2 = calc_invoice_total_val2.toFixed(2);
    }else{                   
        calc_invoice_total_val2 = calc_invoice_total_val2.toFixed(2);  
    }
    return calc_invoice_total_val2;
}

function getInvoiceTotalDiff(item,calc_invoice_total_val1,calc_invoice_total_val2,calc_charged_rate,decimal_margin_val){
    var calc_diff_invoice_total = 0;
    if(item.charged_currency == "BRL" && calc_charged_rate > 0){ 
        calc_diff_invoice_total = calc_invoice_total_val2 - calc_invoice_total_val1;
        calc_diff_invoice_total = calc_diff_invoice_total.toFixed(2);              
        if((calc_diff_invoice_total <= 0.01) && (calc_diff_invoice_total >= -0.01)){                
            calc_diff_invoice_total = decimal_margin_val;
        } 
    }    
    return calc_diff_invoice_total;
}

function shouldSkipInvoice(item, calc_invoice_total_val1, calc_invoice_total_val2, calc_charged_rate, calc_diff_invoice_total, decimal_margin_val){
    console.log("***** Before skipping the invoice (order : "+item.increment_id+") as subtotal_invoiced + shipping_amount + discount_amount ("+calc_invoice_total_val2+") != item.total_paid("+item.total_paid+") + item.customer_balance_invoiced("+item.customer_balance_invoiced+") which is ("+(calc_invoice_total_val1)+")*****");
    if( (item.total_paid != item.total_invoiced) || (calc_invoice_total_val2 != calc_invoice_total_val1 ) ){
        console.log("skipping the invoice (order : "+item.increment_id+") as total_paid("+item.total_paid+") != item.total_invoiced("+item.total_invoiced+") OR ");
        console.log("skipping the invoice (order : "+item.increment_id+") as subtotal_invoiced + shipping_amount + discount_amount ("+calc_invoice_total_val2+") != item.total_paid("+item.total_paid+") + item.customer_balance_invoiced("+item.customer_balance_invoiced+") which is ("+(calc_invoice_total_val1)+")");
        if((item.charged_currency == "BRL" && calc_charged_rate > 0) && calc_diff_invoice_total > decimal_margin_val){
            return true; //will skip the invoice, if the above condition is true.
        }
        console.log("before skip continue;");
        return true;           
    }
    return false;
}
//*********Invoice Validations************

module.exports = get;
