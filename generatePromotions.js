const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();
const errHandler = require('../lib/error-handlers.js');
const csvstringify = require('csv-stringify');
const sftpSender = require('./sftpSender.js');
const fs = require('fs');
const s3 = new AWS.S3();
const dayjs = require('dayjs')
const date = new Date();
const sqs = new AWS.SQS({apiVersion: '2012-11-05'});

exports.handler =  async function (event) {   
    console.log("Begins SQS queue data processing....");    
    let storeCode  =  "";
    let params = "";
    let fileName = "";
    let fileOutput = "";
    let fileData = "";
    let validateEventMsg = "";
    let queryResponse = "";
    if(event.hasOwnProperty('Records')){          
        for (const element of event.Records) {
            if((element.body !== "" && element.body !== null)){
                storeCode = element.body;                
                validateEventMsg = validate(storeCode);
                console.log("storeCode : "+storeCode);               
                if(validateEventMsg == "TRUE"){
                    fileName = storeCode+"_promotion_"+dayjs().format(`YYYYMMDDHHmmss`)+".csv";        
                    params = getParams(storeCode);            
                    queryResponse =  await dynamodb.query(params).promise(); 
                    fileData = generateFileData(queryResponse.Items);
                    fileOutput = await createCSV(fileData);
                    await putCSVToS3(process.env.BUCKET,fileName,fileOutput);
                    await putObjectToSFTP(fileName, fileOutput);         
                    console.log("Processing Completed !!! fileName is "+ fileName );                    
                    console.log("Deleting the message from the barcode SQS queue as it is succesffully processed.");
                    let deleteParams = {
                        QueueUrl: process.env.PROMOTION_FEED_SQS_QUEUE_URL,
                        ReceiptHandle: element.receiptHandle
                    };
                    let queueMsgDelRes = await sqs.deleteMessage(deleteParams).promise();
                    console.log("Delete Message Response from SQS:");
                    console.log(queueMsgDelRes);
                }else{
                    return errHandler.setErrorMessage(validateEventMsg);
                }
            }
        }
    } else {
        console.log('No Records in the event from promotion feed queue(SQS).'); 
    }     
};

// build parameters to get data for promotion table
function getParams(storeIdentifier){
  
    let params = "";    
    params = {
        ExpressionAttributeValues: {
            ":v1": {
              S: storeIdentifier
             }
           }, 
        KeyConditionExpression: "StoreIdentifier = :v1",       
        ScanIndexForward: false,          
        TableName: process.env.PROMOTION_TABLE
    };
    
    return params;
}

// Generate the csv file data
function generateFileData(inputData){    
    let modifiedPromotions = [];
    modifiedPromotions = inputData;
    let index = 0;
    for (const element of modifiedPromotions) { 
        console.log(element);
        console.log(JSON.stringify(element));
        let localItemDesc = checkDataValue(element,"LocalItemDescription","S");
        let globalStoreDesc = checkDataValue(element,"GlobalStoreDescription","S");
        let promoTypeDesc = checkDataValue(element,"PromotionTypeDescription","S");        
        modifiedPromotions[index].StoreIdentifier = checkDataValue(element,"StoreIdentifier","S");
        modifiedPromotions[index].CampaignName = checkDataValue(element,"CampaignName","S");
        modifiedPromotions[index].GlobalItemCode = checkDataValue(element,"GlobalItemCode","S");
        modifiedPromotions[index].LocalItemCode = checkDataValue(element,"LocalItemCode","S");
        modifiedPromotions[index].LocalItemDescription = sanitizeData(localItemDesc);
        modifiedPromotions[index].GlobalStoreDescription = sanitizeData(globalStoreDesc);
        modifiedPromotions[index].PromotionTypeDescription = sanitizeData(promoTypeDesc);
        modifiedPromotions[index].PromotionStartDate = checkDataValue(element,"PromotionStartDate","N");
        modifiedPromotions[index].PromotionEndDate = checkDataValue(element,"PromotionEndDate","N");
        modifiedPromotions[index].PromotionStatus = checkDataValue(element,"PromotionStatus","S");
        modifiedPromotions[index].PromotionCode = checkDataValue(element,"PromotionCode","S");
        modifiedPromotions[index].LocalItemCategory = checkDataValue(element,"LocalItemCategory","S");
        modifiedPromotions[index].DiscountType = checkDataValue(element,"DiscountType","N");
        modifiedPromotions[index].PromoType = checkDataValue(element,"PromoType","N");
        modifiedPromotions[index].PromotionType = checkDataValue(element,"PromotionType","N");
        modifiedPromotions[index].ConditionValue = checkDataValue(element,"ConditionValue","N");
        modifiedPromotions[index].ContitionType = checkDataValue(element,"ContitionType","N");
        modifiedPromotions[index].DiscountUnit = checkDataValue(element,"DiscountUnit","N");
        modifiedPromotions[index].DiscountValue = checkDataValue(element,"DiscountValue","N");
        modifiedPromotions[index].LayerNumber = checkDataValue(element,"LayerNumber","S");
        modifiedPromotions[index].PercentOff = checkDataValue(element,"PercentOff","N");
        modifiedPromotions[index].PriceType = checkDataValue(element,"PriceType","S");
        modifiedPromotions[index].RewardItem = checkDataValue(element,"RewardItem","N");
        index++;
    } 
    return modifiedPromotions;
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

function checkDataValue(inputElement, inputKey, _valtype) { 
    try{
        if(inputElement.hasOwnProperty(inputKey)){        
            return inputElement[inputKey][_valtype];               
        }
        else{
            return "";
        }
    }
    catch(err){
        console.log(err);
    }    
}

// Put CSV file into ftp location
async function putObjectToSFTP(key, data){
    try{
        let lhr_boutique_sftp_promotion_path = process.env.LHR_BOUTIQUE_SFTP_PROMOTION_PATH;
        await sftpSender.connectToSFTP();
        await sftpSender.sendFile(lhr_boutique_sftp_promotion_path,key,Buffer.from(data));
        await sftpSender.disconnectSFTP();
        return true;
    }
    catch(err){
        console.log(err);
    } 
}

// Create CSV
function createCSV(promotions) {

    let columns = {
        StoreIdentifier: 'store',
        CampaignName: 'CampaignName',
        GlobalItemCode: 'SKU',
        LocalItemCode: 'LocalItemCode',
        LocalItemDescription: 'ProductDescription',
        GlobalStoreDescription: 'Location',
        PromotionTypeDescription: 'PromoDescription',
        PromotionStartDate: 'StartDate',
        PromotionEndDate: 'EndDate',
        PromotionStatus: 'Status',
        PromotionCode: 'PromoCode',
        LocalItemCategory: 'Category',
        DiscountType: 'DiscountType',
        PromoType: 'PromoType',
        PromotionType: 'PromotionType',
        ConditionValue: 'ConditionValue',
        ContitionType: 'ContitionType',
        DiscountUnit: 'DiscountUnit',
        DiscountValue: 'DiscountValue',
        LayerNumber: 'LayerNumber',
        PercentOff: 'PercentOff',
        PriceType: 'PriceType',
        RewardItem: 'RewardItem'
    };

    return new Promise((resolve, reject) => {
        csvstringify(promotions, { header: { "Content-Type": "application/json", "charset": "utf-8" }, columns: columns, delimiter: '|', quoted: false, escape: "" }, (err, output) => {
            if (err) reject(new Error('Error Creating CSV File! ' + err));
            fs.writeFile('promotions.csv', output, 'utf8', (error) => {
                if (error) reject(new Error('Error Writing CSV File!'));
                resolve(output);
                console.log('promotions.csv saved.');
            });
            resolve(output);
            console.log('promotions.csv saved.');
        });
    });
}

// PUT CSV files into S3
function putCSVToS3(bucket, key, data) {
    return new Promise((resolve, reject) => {

        let params = {
            Bucket: bucket,
            Key: key,
            Body: data
        }

        s3.putObject(params, function (err, csvdata) {
            if (err) reject(new Error('Error Writing To S3: ') + err);
            else {
                resolve(csvdata);
            }
        });
    });
}

// sanitise description field values
function sanitizeData(Description){
    let describe = Description.replace(/"/g, "");
    describe = describe.replace(/,/g, " - ");
    return describe;
}
