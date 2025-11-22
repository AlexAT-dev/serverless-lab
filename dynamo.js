const AWS = require("aws-sdk");

const isOffline = process.env.IS_OFFLINE;

const dynamo = new AWS.DynamoDB.DocumentClient(
  isOffline
    ? {
        region: "localhost",
        endpoint: "http://localhost:8000",
        accessKeyId: "fakeMyKeyId",
        secretAccessKey: "fakeSecretAccessKey",
      }
    : { region: "eu-central-1" }
);

module.exports = dynamo;