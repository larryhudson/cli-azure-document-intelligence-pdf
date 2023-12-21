import fs from "fs";
import path from "path";
import "dotenv/config";

// Example usage:
// node correct-text.js ./my-text.txt
const [inputFilePath] = process.argv.slice(2);

// read the text file
const inputText = fs.readFileSync(inputFilePath, "utf8");

// correct the text
const correctedText = await correctText(inputText);

// check output folder exists
const outputFolderName = "corrected-pages";
if (!fs.existsSync(outputFolderName)) {
  fs.mkdirSync(outputFolderName);
}

// write the output file
const inputFileName = path.basename(inputFilePath, ".txt");
const outputFilePath = path.join(outputFolderName, inputFileName + ".txt");
fs.writeFileSync(outputFilePath, correctedText);

// this sends the text to the GPT-4 API and returns the corrected text.
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
      // environment variables should be in .env file
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const responseJson = await openAiResponse.json();
  const correctedText = responseJson.choices[0].message.content;

  return correctedText;
}
