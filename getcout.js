var BaseModel = require('../../../../lib/base.js'),
    util = require('util'),
    filter = require('../../../../lib/filter.js'),
    status = require('../../../../lib/status.js'),
    traduction = require('../../../../lib/traduction.js');
    apilib = require('../../../../lib/api.js'),
    is_wh_pending = false;

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
    url = filter.applyOmsStatusFilter(event,url,index);

    return url;
};


get.prototype.forward = function (event) {
    let post_data = "";
    if (event.body !== null) {
        post_data = event.body;
    } else {
        post_data = "";
    }
    post_data = "";
    
    api = new apilib(oms_host_domain, this.path(event), event.httpMethod, oms_auth_key, JSON.stringify(post_data), this.ondata, this.onerror, this);
    api.call();
};



get.prototype.chunk = function (chunk, event, res) {
    try {
        if (res.statusCode != 200) {
            var json = {lang: lang, message: JSON.parse(chunk).message, url:"getcount"};
            var message = traduction.getTraducedWord(json);
            response = {
                "success": false,
                "message": message,
                "data": "",
                "requestId": global.requestId,
            }
            return JSON.stringify(response);
        }
        var lang;
        if(event.headers.posLanguage != undefined && event.headers.posLanguage != ""){
            lang = event.headers.posLanguage;
        }else{
            lang = process.env.LANGUAGE_DEFAULT;
        }
        var orders =  JSON.parse(chunk);
        if (orders && orders.data) {
            var json = {lang: lang, message: "The number of $2 order are $3", url:"getcount",count: orders.data.items.total, param : event.queryStringParameters.status};
        } else {
            var json = {lang: lang, message: "The number of $2 order are $3", url:"getcount",count:0, param: event.queryStringParameters.status};
        }
        var message = traduction.getTraducedWord(json);
        var response = {
            "success": true,
            "message": message,
            "data": {
                'count': orders.data.items.total
            }
        }
        return JSON.stringify(response);
    } catch (e) {
        var json = {lang: lang, message: 'Error: An unexpected error happened', url:"getcount"};
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
