const AWS = require('aws-sdk');
const errHandler = require('../../lib/error-handlers.js');
AWS.config.apiVersions = {
    sqs: '2012-11-05'    
  };
const sqs = new AWS.SQS();

exports.handler =  async function (event) {
    let storeCode  = process.env.PROMOTION_STORECODE; 
    storeCode = storeCode.replace(/ /g, "");  // remove all unwanted space from store codes. 
    let storeCodeList = [];
    let result = "";
    let sqsParams = "";
    let sqsResponse = "";    
    let validateEventMsg = validate(storeCode);
    if(validateEventMsg == "TRUE"){
        console.log("storeCode : "+storeCode);
        result = storeCode.includes(",") ? "TRUE" : "FALSE";
        console.log("result :"+ result);   
        if (result =="TRUE") {
            storeCodeList = storeCode.split(",");
            for (const element of storeCodeList){          
                console.log(element);
                console.log(process.env.PROMOTION_FEED_SQS_QUEUE_URL);
                let validateElementMsg = validate(element);
                if(validateElementMsg == "TRUE"){
                    sqsParams = {
                        DelaySeconds: 2,
                        MessageAttributes: {
                          "service": {
                            DataType: "String",
                            StringValue: "Heathrow promotion feed"
                          },
                        },
                        MessageBody: element,
                        QueueUrl: process.env.PROMOTION_FEED_SQS_QUEUE_URL
                      };
                      console.log(sqsParams);                                  
                      sqsResponse = await sqs.sendMessage(sqsParams).promise();
                      console.log(sqsResponse);
                }else{
                    console.log("Element level validation : "+validateElementMsg);
                } 
                
            }  
        }else{                       
            sqsParams = {
                DelaySeconds: 2,
                MessageAttributes: {
                  "service": {
                    DataType: "String",
                    StringValue: "Heathrow promotion feed"
                  },
                },
                MessageBody: storeCode,
                QueueUrl: process.env.PROMOTION_FEED_SQS_QUEUE_URL
              };                  
              sqsResponse = await sqs.sendMessage(sqsParams).promise();
              console.log(sqsResponse);
        }
    }else{
        return errHandler.setErrorMessage(validateEventMsg);
    }       
}

//Validate the mandatory params and generate error message.
function validate(storeCode){
    let msg = [];
    let errorMsg = "";   

    if ((storeCode == "") || storeCode == null ){
        msg.push("store code must not be empty");
    } 
     
    if(msg.length > 0){       
        errorMsg =  errHandler.processMessage(msg);
        return errorMsg;
    }else{
        return "TRUE";
    }
}
