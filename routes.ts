/* tslint:disable */
/* eslint-disable */
import { Controller, TsoaRoute } from '@tsoa/runtime';
import { iocContainer } from './local/tsao-utils';
import { CategoryStatisticsController } from './local/category-statistics-controller';
import { ContactsController } from './local/contacts-controller';
import { ContactsExternalPiiController } from './local/contacts-external-pii-controller';

const models: TsoaRoute.Models = {
    "Brand": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"quantityPurchased":{"dataType":"double","required":true},"brandName":{"dataType":"string","required":true}},"validators":{}},
    },
    "CategoryContent": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"topBrands":{"dataType":"array","array":{"dataType":"refAlias","ref":"Brand"},"required":true},"salesPercentage":{"dataType":"double","required":true},"quantityPurchased":{"dataType":"double","required":true},"categoryDcisName":{"dataType":"string","required":true}},"validators":{}},
    },
    "CategoryStatisticsResponse": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"content":{"dataType":"array","array":{"dataType":"refAlias","ref":"CategoryContent"},"required":true}},"validators":{}},
    },
    "GetContactResponse": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"pointsToNextTier":{"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},"pointsBalance":{"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},"validity":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},"subTierName":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},"subTierCode":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},"tierCode":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},"tierName":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]}},"validators":{}},
    },
    "GetContactExternalPiiResponse": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"memberQrData":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},"pointsToNextTier":{"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},"pointsBalance":{"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}]},"validity":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},"subTierName":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},"subTierCode":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},"tierCode":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},"tierName":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]}},"validators":{}},
    },
};

export function RegisterRoutes(app: any, authorizer: unknown) {
        app.get('/v1/sales/:customerId/category-statistics',
        authorizer,
            function (request: any, response: any, next: any) {
            const args = {
                    customerId: {"in":"path","name":"customerId","required":true,"dataType":"string"},
                    numberOfMonths: {"in":"query","name":"numberOfMonths","required":true,"dataType":"double"},
            };

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request);
            } catch (err) {
                return next(err);
            }

            const controller = iocContainer.get<CategoryStatisticsController>(CategoryStatisticsController);


            const promise = controller.getCategoryStatistics.apply(controller, validatedArgs as any);
            promiseHandler(controller, promise, response, next);
        });
        app.get('/v1/contacts/external',
        authorizer,
            function (request: any, response: any, next: any) {
            const args = {
                    customerId: {"in":"query","name":"customerId","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request);
            } catch (err) {
                return next(err);
            }

            const controller = iocContainer.get<ContactsController>(ContactsController);


            const promise = controller.getContact.apply(controller, validatedArgs as any);
            promiseHandler(controller, promise, response, next);
        });
        app.get('/v1/contacts/external-pii',
        authorizer,
            function (request: any, response: any, next: any) {
            const args = {
                    customerId: {"in":"query","name":"customerId","required":true,"dataType":"string"},
            };

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request);
            } catch (err) {
                return next(err);
            }

            const controller = iocContainer.get<ContactsExternalPiiController>(ContactsExternalPiiController);


            const promise = controller.getContactPii.apply(controller, validatedArgs as any);
            promiseHandler(controller, promise, response, next);
        });

    function promiseHandler(controllerObj: any, promise: any, response: any, next: any) {
        return Promise.resolve(promise)
            .then((data: any) => {
                let statusCode;
                if (controllerObj instanceof Controller) {
                    const controller = controllerObj as Controller
                    const headers = controller.getHeaders();
                    Object.keys(headers).forEach((name: string) => {
                        response.set(name, headers[name]);
                    });

                    statusCode = controller.getStatus();
                }

                if (data !== null && data !== undefined) {
                    response.status(statusCode || 200).json(data);
                } else {
                    response.status(statusCode || 204).end();
                }
            })
            .catch((error: any) => next(error));
    }

    function getValidatedArgs(args: any, request: any): any[] {
        const values = Object.keys(args).map(function (key) {
          const name = args[key].name;
          switch (args[key].in) {
            case 'request':
              return request;
            case 'query':
              return request.query[name];
            case 'path':
              return request.params[name];
            case 'header':
              return request.header(name);
            case 'body':
              return request.body;
            case 'body-prop':
              return request.body[name];
          }
        });

        return values;
      }
}
