const { v4: uuid } = require("uuid");
const dynamo = require("./dynamo");
const AWS = require("aws-sdk");

const isOffline = process.env.IS_OFFLINE;

const sqs = new AWS.SQS(
  isOffline
    ? {
        region: "localhost",
        endpoint: "http://localhost:9324",
        accessKeyId: "fakeMyKeyId",
        secretAccessKey: "fakeSecretAccessKey",
      }
    : { region: "eu-central-1" }
);



// ------------------ SEND EVENT TO SQS ------------------
async function sendToQueue(queueUrl, message) {
  const params = {
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(message),
  };
  try {
    const result = await sqs.sendMessage(params).promise();
    console.log("Message sent to SQS:", result.MessageId);
    return result;
  } catch (err) {
    console.error("Failed to send message to SQS:", err);
    throw err;
  }
}

// ------------------ CREATE ORGANIZATION ------------------
module.exports.createOrganizationAsync = async (event) => {
  try {
    const { name, description } = JSON.parse(event.body);
    if (!name) return { statusCode: 400, body: JSON.stringify({ message: "Missing name" }) };

    // check duplicate organization name
    const orgScan = await dynamo.scan({
      TableName: "Organizations",
      FilterExpression: "#n = :name",
      ExpressionAttributeNames: { "#n": "name" },
      ExpressionAttributeValues: { ":name": name }
    }).promise();

    if (orgScan.Items && orgScan.Items.length > 0) {
      return { statusCode: 409, body: JSON.stringify({ message: "Organization with this name already exists" }) };
    }

    const orgId = uuid();
    const queueUrl = process.env.ORGANIZATION_QUEUE_URL;

    await sendToQueue(queueUrl, { type: "CREATE_ORG", orgId, name, description });

    return { statusCode: 202, body: JSON.stringify({ message: "Organization queued", orgId }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify(err) };
  }
};

// ------------------ UPDATE ORGANIZATION ------------------
module.exports.updateOrganizationAsync = async (event) => {
  try {
    const { orgId, name, description } = JSON.parse(event.body);
    if (!orgId) return { statusCode: 400, body: JSON.stringify({ message: "orgId required" }) };

    // check organization exists
    const org = await dynamo.get({ TableName: "Organizations", Key: { orgId } }).promise();
    if (!org.Item) return { statusCode: 404, body: JSON.stringify({ message: "Organization not found" }) };

    // if name changed, ensure no other org has that name
    if (name && name !== org.Item.name) {
      const nameScan = await dynamo.scan({
        TableName: "Organizations",
        FilterExpression: "#n = :name",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: { ":name": name }
      }).promise();
      if (nameScan.Items && nameScan.Items.length > 0) {
        return { statusCode: 409, body: JSON.stringify({ message: "Organization with this name already exists" }) };
      }
    }

    const queueUrl = process.env.ORGANIZATION_QUEUE_URL;
    await sendToQueue(queueUrl, { type: "UPDATE_ORG", orgId, name, description });

    return { statusCode: 202, body: JSON.stringify({ message: "Organization update queued", orgId }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify(err) };
  }
};

// ------------------ CREATE USER ------------------
module.exports.createUserAsync = async (event) => {
  try {
    const { orgId } = event.pathParameters;
    const { name, email } = JSON.parse(event.body);
    if (!name || !email) return { statusCode: 400, body: JSON.stringify({ message: "Missing fields" }) };

    // check organization exists
    const org = await dynamo.get({ TableName: "Organizations", Key: { orgId } }).promise();
    if (!org.Item) return { statusCode: 404, body: JSON.stringify({ message: "Organization not found" }) };

    // check duplicate email
    const emailCheck = await dynamo.scan({
      TableName: "Users",
      FilterExpression: "email = :email",
      ExpressionAttributeValues: { ":email": email }
    }).promise();
    if (emailCheck.Items && emailCheck.Items.length > 0) return { statusCode: 409, body: JSON.stringify({ message: "Email already exists" }) };

    const userId = uuid();
    const queueUrl = process.env.USER_QUEUE_URL;

    await sendToQueue(queueUrl, { type: "CREATE_USER", userId, orgId, name, email });

    return { statusCode: 202, body: JSON.stringify({ message: "User queued", userId }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify(err) };
  }
};

// ------------------ UPDATE USER ------------------
module.exports.updateUserAsync = async (event) => {
  try {
    const { orgId } = event.pathParameters;
    const { userId, name, email } = JSON.parse(event.body);
    if (!userId) return { statusCode: 400, body: JSON.stringify({ message: "userId required" }) };

    // check user exists
    const user = await dynamo.get({ TableName: "Users", Key: { userId } }).promise();
    if (!user.Item) return { statusCode: 404, body: JSON.stringify({ message: "User not found" }) };

    // check ownership
    if (user.Item.orgId !== orgId) return { statusCode: 409, body: JSON.stringify({ message: "User does not belong to this organization" }) };

    // if email changed, check duplicates
    if (email && email !== user.Item.email) {
      const emailCheck = await dynamo.scan({
        TableName: "Users",
        FilterExpression: "email = :email",
        ExpressionAttributeValues: { ":email": email }
      }).promise();
      if (emailCheck.Items && emailCheck.Items.length > 0) return { statusCode: 409, body: JSON.stringify({ message: "Email already in use" }) };
    }

    const queueUrl = process.env.USER_QUEUE_URL;
    await sendToQueue(queueUrl, { type: "UPDATE_USER", userId, orgId, name, email });

    return { statusCode: 202, body: JSON.stringify({ message: "User update queued", userId }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify(err) };
  }
};

// ------------------ GET ALL ORGANIZATIONS ------------------
module.exports.getOrganizationsAsync = async () => {
  try {
    const orgs = await dynamo.scan({ TableName: "Organizations" }).promise();
    return { statusCode: 200, body: JSON.stringify(orgs.Items) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify(err) };
  }
};

// ------------------ GET ALL USERS ------------------
module.exports.getUsersAsync = async () => {
  try {
    const users = await dynamo.scan({ TableName: "Users" }).promise();
    return { statusCode: 200, body: JSON.stringify(users.Items) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify(err) };
  }
};

// ------------------ SQS PROCESSING ------------------
module.exports.processOrganizationQueue = async (event) => {
  for (const record of event.Records) {
    const msg = JSON.parse(record.body);

    if (msg.type === "CREATE_ORG" || msg.type === "UPDATE_ORG") {
      const item = { orgId: msg.orgId, name: msg.name, description: msg.description };
      await dynamo.put({ TableName: "Organizations", Item: item }).promise();
    }
  }
};

module.exports.processUserQueue = async (event) => {
  for (const record of event.Records) {
    const msg = JSON.parse(record.body);

    if (msg.type === "CREATE_USER" || msg.type === "UPDATE_USER") {
      const item = { userId: msg.userId, orgId: msg.orgId, name: msg.name, email: msg.email };
      await dynamo.put({ TableName: "Users", Item: item }).promise();
    }
  }
};