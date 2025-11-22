const AWS = require("aws-sdk");

const isOffline = true; //process.env.IS_OFFLINE;

const dynamodb = new AWS.DynamoDB(
  isOffline
    ? {
        region: "localhost",
        endpoint: "http://localhost:8000",
        accessKeyId: "fakeMyKeyId",
        secretAccessKey: "fakeSecretAccessKey",
      }
    : { region: "eu-central-1" }
);

async function createTableIfNotExists(params) {
  try {
    const tables = await dynamodb.listTables().promise();
    if (!tables.TableNames.includes(params.TableName)) {
      console.log(`Creating table ${params.TableName}...`);
      await dynamodb.createTable(params).promise();
      console.log(`Table ${params.TableName} created.`);
    } else {
      console.log(`Table ${params.TableName} already exists.`);
    }
  } catch (err) {
    console.error("Error creating table:", err);
  }
}

async function setupTables() {
  await createTableIfNotExists({
    TableName: "Organizations",
    AttributeDefinitions: [
      { AttributeName: "orgId", AttributeType: "S" },
      { AttributeName: "name", AttributeType: "S" }
    ],
    KeySchema: [{ AttributeName: "orgId", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
      {
        IndexName: "nameIndex",
        KeySchema: [{ AttributeName: "name", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" }
      }
    ],
    BillingMode: "PAY_PER_REQUEST"
  });

  await createTableIfNotExists({
    TableName: "Users",
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "orgId", AttributeType: "S" },
      { AttributeName: "email", AttributeType: "S" }
    ],
    KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
      {
        IndexName: "orgIdIndex",
        KeySchema: [{ AttributeName: "orgId", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" }
      },
      {
        IndexName: "emailIndex",
        KeySchema: [{ AttributeName: "email", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" }
      }
    ],
    BillingMode: "PAY_PER_REQUEST"
  });
}

setupTables().then(() => console.log("Tables setup completed."));
