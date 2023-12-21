import fs from "fs";
import path from "path";
import "dotenv/config";

async function correctText(text) {
  const openAiUrl = "https://api.openai.com/v1/chat/completions";

  const systemPrompt =
    "The supplied text has been extracted from a blurry page. There may be characters from the edge of adjacent pages that need to be deleted. Correct the text so that it makes sense.";

  const requestBody = {
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: text,
      },
    ],
  };

  const openAiResponse = await fetch(openAiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const responseJson = await openAiResponse.json();
  const correctedText = responseJson.choices[0].message.content;

  return correctedText;
}

const [txtFilePath] = process.argv.slice(2);
console.log("txtFilePath", txtFilePath);
const txtFilename = path.basename(txtFilePath, ".txt");

// const pageNumber = parseInt(txtFilename, 10);
// const pageNumberIsEven = pageNumber % 2 === 0;
// if (!pageNumberIsEven) {
//   return;
// }

const outputFolderName = "corrected";
if (!fs.existsSync(outputFolderName)) {
  fs.mkdirSync(outputFolderName);
}
const outputFilePath = path.join(outputFolderName, txtFilename + ".txt");
const text = fs.readFileSync(txtFilePath, "utf8");
const correctedText = await correctText(text);
fs.writeFileSync(outputFilePath, correctedText);
process.exit(0);
