var BaseModel = require('../../lib/magento.js'),
    util = require('util'),
    validator = require('../../lib/validator.js'),
    filter = require('../../lib/filter.js');
function get() {
    get.super_.apply(this, arguments);
}
get.super_ = BaseModel;
util.inherits(get, BaseModel);

get.prototype.path = function (event) {
    return event.app.mag_api_path + event.app.proxy_request_uri + '?' + filter.filterQuery('created_at', event.app.queryfilter.created_at, 'like', 1, 0) + '&' + filter.filterQuery('store_id', event.requestContext.authorizer.storeIds, 'in', 2, 0) + '&' + filter.paginationQuery(event.app.queryfilter.page, event.app.queryfilter.pagesize);
};

get.prototype.chunk = function (chunk){
    var creditMemos = "";
    var dataTemplate = "";
    var creditMemosTemplate = "";
    var data = "";
    var itemTemplate = "";
    var cms = "";
    var subItemData = "";

    try {
        creditMemos = validator.parseChunk(chunk);
    }catch (err) {     
        console.log(err + " Response chunk : "+ chunk);    
        throw new Error("Invalid JSON response");              
    }
    try{
         dataTemplate = "{\"data\":[]}";
         creditMemosTemplate = "{\"sales_order_increment_id\":\"\",\"external_order_id\":\"\",\"increment_id\":\"\",\"total_refunded\":\"\",\"tax_refunded\":\"\",\"transaction_id\":\"\",\"created_at\":\"\",\"Items\":[]}"
         data = JSON.parse(dataTemplate).data;
         itemTemplate = "{\"item\":{\"sku\":\"\",\"qty_refunded\":\"\",\"row_total_incl_tax\":\"\",\"tax_amount\":\"\"}}";
        
        var cmIndex = 0;
        if (creditMemos.items && creditMemos.items[0]) {
            creditMemos.items.forEach(function (item) {                
                cms = JSON.parse(creditMemosTemplate);                
                cms.created_at = item.created_at;
                cms.increment_id = item.increment_id;
                cms.external_order_id = item.extension_attributes.external_order_id? item.extension_attributes.external_order_id : "";
                cms.sales_order_increment_id = item.extension_attributes.order_increment_id? item.extension_attributes.order_increment_id : "";
                cms.total_refunded = item.grand_total;
                cms.tax_refunded = item.tax_amount;
                cms.transaction_id = item.transaction_id? item.transaction_id: "";                
                data.push(cms);
                item.items.forEach(function (subItem){                
                    subItemData = JSON.parse(itemTemplate).item;
                    if(subItem.price > 0){
                        subItemData.sku = subItem.sku;
                        subItemData.qty_refunded = subItem.qty;
                        subItemData.row_total_incl_tax = subItem.row_total_incl_tax;
                        subItemData.tax_amount = subItem.tax_amount;                   
                        data[cmIndex].Items.push(subItemData);                             
                    }                
                });
                cmIndex++;            
            });
        } 
        var response = {
            "success": true,       
            "data": data
        }
        return JSON.stringify(response);
    }catch (err) {   
        console.log(err);     
        throw new Error("Error in fetching Credit Memos.");              
    }     
};


module.exports = get;
