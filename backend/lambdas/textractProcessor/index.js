const { TextractClient, AnalyzeDocumentCommand } = require("@aws-sdk/client-textract");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

const textract = new TextractClient({ region: "us-east-1" });
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));
const lambda = new LambdaClient({ region: "us-east-1" });

const BUCKET_NAME = process.env.BUCKET_NAME;
const TABLE_NAME = process.env.TABLE_NAME;
const BEDROCK_LAMBDA = process.env.BEDROCK_LAMBDA;

exports.handler = async (event) => {
  const { invoiceId, s3Key } = event;

  try {
    // Call Textract — extract tables + forms from PDF
    const textractResponse = await textract.send(new AnalyzeDocumentCommand({
      Document: {
        S3Object: {
          Bucket: BUCKET_NAME,
          Name: s3Key,
        },
      },
      FeatureTypes: ["TABLES", "FORMS"],
    }));

    // Parse Textract response into clean structure
    const extractedData = parseTextractResponse(textractResponse.Blocks);

    // Update DynamoDB with extracted data
    await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { invoiceId },
      UpdateExpression: "SET #status = :status, textractData = :textractData, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "ANALYZING",
        ":textractData": extractedData,
        ":updatedAt": new Date().toISOString(),
      },
    }));

    // Trigger Lambda 3 async
    await lambda.send(new InvokeCommand({
      FunctionName: BEDROCK_LAMBDA,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify({ invoiceId, extractedData })),
    }));

  } catch (err) {
    console.error("TextractProcessor error:", err);

    // Update DynamoDB with ERROR status
    await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { invoiceId },
      UpdateExpression: "SET #status = :status, errorMessage = :error",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "ERROR",
        ":error": err.message,
      },
    }));
  }
};

// Parse Textract blocks into clean JSON
const parseTextractResponse = (blocks) => {
  const lines = [];
  const keyValuePairs = {};
  const tables = [];

  // Extract raw lines
  blocks
    .filter(b => b.BlockType === "LINE")
    .forEach(b => lines.push(b.Text));

  // Extract key-value pairs (FORMS)
  const keyBlocks = blocks.filter(b => b.BlockType === "KEY_VALUE_SET" && b.EntityTypes?.includes("KEY"));
  keyBlocks.forEach(keyBlock => {
    const keyText = getTextFromBlock(keyBlock, blocks);
    const valueBlock = findValueBlock(keyBlock, blocks);
    const valueText = valueBlock ? getTextFromBlock(valueBlock, blocks) : "";
    if (keyText) keyValuePairs[keyText] = valueText;
  });

  // Extract tables
  const tableBlocks = blocks.filter(b => b.BlockType === "TABLE");
  tableBlocks.forEach(tableBlock => {
    const table = [];
    const cellBlocks = getRelatedBlocks(tableBlock, blocks, "CHILD");
    cellBlocks
      .filter(b => b.BlockType === "CELL")
      .forEach(cell => {
        if (!table[cell.RowIndex - 1]) table[cell.RowIndex - 1] = [];
        table[cell.RowIndex - 1][cell.ColumnIndex - 1] = getTextFromBlock(cell, blocks);
      });
    tables.push(table);
  });

  return { lines, keyValuePairs, tables };
};

const getTextFromBlock = (block, blocks) => {
  if (!block.Relationships) return "";
  const childIds = block.Relationships
    .filter(r => r.Type === "CHILD")
    .flatMap(r => r.Ids);
  return blocks
    .filter(b => childIds.includes(b.Id) && b.BlockType === "WORD")
    .map(b => b.Text)
    .join(" ");
};

const findValueBlock = (keyBlock, blocks) => {
  if (!keyBlock.Relationships) return null;
  const valueId = keyBlock.Relationships
    .find(r => r.Type === "VALUE")
    ?.Ids?.[0];
  return blocks.find(b => b.Id === valueId);
};

const getRelatedBlocks = (block, blocks, relationshipType) => {
  if (!block.Relationships) return [];
  const ids = block.Relationships
    .filter(r => r.Type === relationshipType)
    .flatMap(r => r.Ids);
  return blocks.filter(b => ids.includes(b.Id));
};