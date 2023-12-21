import fs from "fs";
import path from "path";
import pMap from "p-map";
import "dotenv/config";

async function convertTextToAudio(text) {
  const textIsTooLong = text.length > 4000;
  if (textIsTooLong) {
    console.log(
      "Warning: text is too long, only converting first 4000 characters",
    );
  }

  console.log("Converting text to audio");
  console.log(text.slice(0, 100) + "...");
  const textToConvert = text.slice(0, 4000);

  const requestUrl = "https://api.openai.com/v1/audio/speech";
  const requestBody = {
    model: "tts-1",
    input: textToConvert,
    voice: "onyx",
  };

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  const responseArrayBuffer = await response.arrayBuffer();
  const responseBuffer = Buffer.from(responseArrayBuffer);

  return responseBuffer;
}

// break text into chunks that are no longer than 4000 chars, breaking on .
function breakTextIntoChunks(text) {
  let chunks = [];
  let currentChunk = "";
  const sentences = text.split(".\n").filter(Boolean);
  for (let sentence of sentences) {
    if (currentChunk.length + sentence.length > 4000) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += sentence + ".\n";
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function convertTextChunksToAudio(chunks, audioFilePath) {
  const audioBuffers = await pMap(chunks, convertTextToAudio, {
    concurrency: 5,
  });
  const audioBuffer = Buffer.concat(audioBuffers);
  fs.writeFileSync(audioFilePath, audioBuffer);
  return;
}

const [textPath] = process.argv.slice(2);
const textFilename = path.basename(textPath, ".txt");
const audioFilePath = `./${textFilename}.mp3`;

const text = fs.readFileSync(textPath, "utf8");

const chunks = breakTextIntoChunks(text);
fs.writeFileSync("./temp-chunks.txt", chunks.join("\nCHUNK\n"));

await convertTextChunksToAudio(chunks, audioFilePath);
process.exit(0);
