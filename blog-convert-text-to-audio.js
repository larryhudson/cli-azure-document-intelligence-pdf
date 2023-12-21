import fs from "fs";
import path from "path";
import pMap from "p-map";
import "dotenv/config";

const [inputPath] = process.argv.slice(2);

const inputText = fs.readFileSync(inputPath, "utf8");

const textChunks = breakTextIntoChunks(inputText);

const inputFilename = path.basename(inputPath, ".txt");
const outputFilePath = `./${inputFilename}.mp3`;
await convertTextChunksToAudio(textChunks, outputFilePath);

process.exit(0);

// break text into chunks that are no longer than 4000 chars
function breakTextIntoChunks(text) {
  const sentenceSeparator = ".\n";
  let chunks = [];
  let currentChunk = "";

  // split text into sentences, and filter out empty sentences
  const sentences = text.split(sentenceSeparator).filter(Boolean);

  for (let sentence of sentences) {
    if (currentChunk.length + sentence.length > 4000) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += sentence + sentenceSeparator;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function convertTextChunksToAudio(chunks, outputFilePath) {
  const audioBuffers = await pMap(chunks, convertTextToAudio, {
    concurrency: 2,
  });
  // join the audio buffers into a single audio buffer
  const audioBuffer = Buffer.concat(audioBuffers);
  fs.writeFileSync(outputFilePath, audioBuffer);
  return;
}

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

  const ttsApiUrl = "https://api.openai.com/v1/audio/speech";
  const requestBody = {
    model: "tts-1",
    input: textToConvert,
    voice: "onyx",
  };

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  const audioResponse = await fetch(ttsApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  const audioArrayBuffer = await audioResponse.arrayBuffer();
  const audioBuffer = Buffer.from(audioArrayBuffer);

  return audioBuffer;
}
