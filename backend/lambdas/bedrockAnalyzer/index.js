const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const https = require("https");

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));

const TABLE_NAME = process.env.TABLE_NAME;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

exports.handler = async (event) => {
  const { invoiceId, extractedData } = event;

  try {
    const prompt = buildPrompt(extractedData);

    // Call Gemini API
    const geminiResponse = await callGemini(prompt);
    const rawText = geminiResponse.candidates[0].content.parts[0].text;

    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Gemini did not return valid JSON");

    const analysis = JSON.parse(jsonMatch[0]);

    // Update DynamoDB with full analysis
    await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { invoiceId },
      UpdateExpression: `SET
        #status = :status,
        anomalies = :anomalies,
        riskScore = :riskScore,
        riskRationale = :riskRationale,
        summary = :summary,
        emailDraft = :emailDraft,
        updatedAt = :updatedAt`,
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "DONE",
        ":anomalies": analysis.anomalies,
        ":riskScore": analysis.riskScore,
        ":riskRationale": analysis.riskRationale,
        ":summary": analysis.summary,
        ":emailDraft": analysis.emailDraft,
        ":updatedAt": new Date().toISOString(),
      },
    }));

  } catch (err) {
    console.error("GeminiAnalyzer error:", err);

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

// Native HTTPS call — no axios needed, zero dependencies
const callGemini = (prompt) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1500,
      },
    });

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(GEMINI_URL, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Failed to parse Gemini response"));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
};

const buildPrompt = (extractedData) => {
  return `You are a senior financial auditor AI. Analyze the following invoice data extracted by AWS Textract.

Invoice Data:
${JSON.stringify(extractedData, null, 2)}

Carefully analyze for:
- Unusual or inflated line item amounts
- Missing mandatory fields (vendor name, invoice number, date, total)
- Mathematical inconsistencies (line items not adding up to total)
- Duplicate line items
- Suspicious patterns

Return ONLY a valid JSON object, no explanation, no markdown, no backticks:
{
  "anomalies": [
    {
      "field": "name of the suspicious field or line item",
      "issue": "clear description of what is wrong",
      "severity": "HIGH or MEDIUM or LOW"
    }
  ],
  "riskScore": <integer between 0 and 100>,
  "riskRationale": "2-3 sentence explanation of the overall risk score",
  "summary": "3-4 sentence plain English summary of the invoice and key findings",
  "emailDraft": "Complete professional email to the finance team flagging the issues found in this invoice. Include specific anomalies and recommended actions."
}`;
};