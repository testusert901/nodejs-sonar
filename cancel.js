var BaseModel = require('../../../../../lib/base.js'),
    util = require('util'),
    apilib = require('../../../../../lib/api.js'),
    filter = require('../../../../../lib/filter.js'),
    traduction = require('../../../../../lib/traduction.js');
var entity_id;
var magentoWHCode = "";
var order_id;

var oms_host_domain = process.env.OMS_API_URL;
var oms_auth_key = process.env.OMS_AUTH_KEY;

function post() {
    post.super_.apply(this, arguments);
}

post.prototype.pre = async function (event, context, forward) {
    this._pre(event, context);

    magentoWHCode = event.app.authorizer.magentoWHCode;

    if (magentoWHCode != "") {
        magentoWHCode = "/" + magentoWHCode;
    }

    let post_data = "";
    api = new apilib(oms_host_domain, this.path(event), "GET", oms_auth_key, JSON.stringify(post_data), function(){}, this.onerror, this);
    apiresult = await api.call();
    JSON.parse(apiresult);
    if(JSON.parse(apiresult).data.items.data.length != 1){
        throw({});//More than one or none so 404
    }
    this.order_id = JSON.parse(apiresult).data.items.data[0].id;
    console.log("this.order_id");
    console.log(this.order_id);
    forward();
}

post.prototype.forward = function (event) {
    if (event.body !== null) {
      post_data = event.body;
    }
    console.log("this.order_id");
    console.log(this.order_id);
    post_data = { "status" : "canceled", "payment_status": "canceled"};
    let api = new apilib(oms_host_domain, this.cancelPath(event)+"/"+this.order_id, 'PUT', oms_auth_key,  JSON.stringify(post_data), this.ondata, onerror, this);
    api.call();    
  };

post.prototype.path = function (event) {
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

post.prototype.cancelPath = function (event) {
    var hfmCode = "";
    if(event?.requestContext?.authorizer?.hfmCode){
        hfmCode = event.requestContext.authorizer.hfmCode;
    }   
    return "/api/v1/"+hfmCode+"/orders";
};

post.prototype.chunk = function (chunk, event, res) {
    var lang;
    if (event.headers.posLanguage != undefined && event.headers.posLanguage != "") {
        lang = event.headers.posLanguage;
    } else {
        lang = process.env.LANGUAGE_DEFAULT;
    }

    var orderid = event.pathParameters.OrderId;
    if (chunk && chunk == 'false') {
        var json = { lang: lang, message: "Order $4 has NOT been canceled. The order is no eligible to be canceled or the order was already canceled", url: "cancel", orderid: orderid };
        var message = traduction.getTraducedWord(json);
        var response = {
            "success": false,
            "message": message,
            "data": {},
            "requestId": global.requestId,
        }
    } else {
        var json = { lang: lang, message: "Order $4 has been canceled successfully.", url: "cancel", orderid: orderid };
        var message = traduction.getTraducedWord(json);
        var response = {
            "success": true,
            "message": message,
            "data": {}
        }
    }
    return JSON.stringify(response);
}

function onerror(res, e) {
    status = res.statusCode ? res.statusCode : 'Error: An unexpected error happened';
    var json = { lang: lang, message: status, url: "cancel" };
    var message = traduction.getTraducedWord(json);
    response = {
        "success": false,
        "message": message,
        "data": "",
        "requestId": global.requestId,
    }
    return JSON.stringify(response);
};



post.super_ = BaseModel;

util.inherits(post, BaseModel);
module.exports = post;
