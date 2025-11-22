const { v4: uuid } = require("uuid");
const dynamo = require("./dynamo");

// ------------------ CREATE ORGANIZATION ------------------
module.exports.createOrganization = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { name, description } = body;

    if (!name) return response(400, { message: "Missing name" });

    const orgScan = await dynamo.scan({
      TableName: "Organizations",
      FilterExpression: "#n = :name",
      ExpressionAttributeNames: { "#n": "name" },
      ExpressionAttributeValues: { ":name": name }
    }).promise();

    if (orgScan.Items.length > 0)
      return response(409, { message: "Organization with this name already exists" });

    const orgId = uuid();
    const item = { orgId, name, description };

    await dynamo.put({ TableName: "Organizations", Item: item }).promise();

    return response(201, item);
  } catch (err) {
    return response(500, err);
  }
};

// ------------------ CREATE USER ------------------
module.exports.createUser = async (event) => {
  try {
    const { orgId } = event.pathParameters;
    const { name, email } = JSON.parse(event.body);

    if (!name || !email) return response(400, { message: "Missing fields" });

    const org = await dynamo.get({ TableName: "Organizations", Key: { orgId } }).promise();
    if (!org.Item) return response(404, { message: "Organization not found" });

    const emailCheck = await dynamo.scan({
      TableName: "Users",
      FilterExpression: "email = :email",
      ExpressionAttributeValues: { ":email": email }
    }).promise();

    if (emailCheck.Items.length > 0) return response(409, { message: "Email already exists" });

    const userId = uuid();
    const item = { userId, orgId, name, email };

    await dynamo.put({ TableName: "Users", Item: item }).promise();

    return response(201, item);
  } catch (err) {
    return response(500, err);
  }
};

// ------------------ GET ALL ORGANIZATIONS ------------------
module.exports.getOrganizations = async () => {
  try {
    const orgs = await dynamo.scan({ TableName: "Organizations" }).promise();
    return response(200, orgs.Items);
  } catch (err) {
    return response(500, err);
  }
};

// ------------------ GET ALL USERS ------------------
module.exports.getUsers = async () => {
  try {
    const users = await dynamo.scan({ TableName: "Users" }).promise();
    return response(200, users.Items);
  } catch (err) {
    return response(500, err);
  }
};

// ------------------ UPDATE ORGANIZATION ------------------
module.exports.updateOrganization = async (event) => {
  try {
    const { orgId, name, description } = JSON.parse(event.body);
    if (!orgId) return response(400, { message: "orgId required" });

    const org = await dynamo.get({ TableName: "Organizations", Key: { orgId } }).promise();
    if (!org.Item) return response(404, { message: "Organization not found" });

    await dynamo.update({
      TableName: "Organizations",
      Key: { orgId },
      UpdateExpression: "set #n = :name, description = :desc",
      ExpressionAttributeNames: { "#n": "name" },
      ExpressionAttributeValues: {
        ":name": name || org.Item.name,
        ":desc": description || org.Item.description
      }
    }).promise();

    return response(200, { message: "Organization updated" });
  } catch (err) {
    return response(500, err);
  }
};

// ------------------ UPDATE USER ------------------
module.exports.updateUser = async (event) => {
  try {
    const { orgId } = event.pathParameters;
    const { userId, name, email } = JSON.parse(event.body);
    if (!userId) return response(400, { message: "userId required" });

    const user = await dynamo.get({ TableName: "Users", Key: { userId } }).promise();
    if (!user.Item) return response(404, { message: "User not found" });

    if (user.Item.orgId !== orgId)
      return response(409, { message: "User does not belong to this organization" });

    if (email && email !== user.Item.email) {
      const emailCheck = await dynamo.scan({
        TableName: "Users",
        FilterExpression: "email = :email",
        ExpressionAttributeValues: { ":email": email }
      }).promise();
      if (emailCheck.Items.length > 0) return response(409, { message: "Email already in use" });
    }

    await dynamo.update({
      TableName: "Users",
      Key: { userId },
      UpdateExpression: "set #n = :name, email = :email",
      ExpressionAttributeNames: { "#n": "name" },
      ExpressionAttributeValues: {
        ":name": name || user.Item.name,
        ":email": email || user.Item.email
      }
    }).promise();

    return response(200, { message: "User updated" });
  } catch (err) {
    return response(500, err);
  }
};

// ------------------ RESPONSE ------------------
function response(status, body) {
  return { statusCode: status, body: JSON.stringify(body) };
}
