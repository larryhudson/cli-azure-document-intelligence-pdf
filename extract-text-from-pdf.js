import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import {
  DocumentAnalysisClient,
  AzureKeyCredential,
} from "@azure/ai-form-recognizer";
import "dotenv/config";
import pMap from "p-map";

async function extractTextFromPdf(pdfPageBuffer) {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

  const client = new DocumentAnalysisClient(
    endpoint,
    new AzureKeyCredential(apiKey),
  );

  async function extractTextFromPdfPage(pageBuffer) {
    const poller = await client.beginAnalyzeDocument(
      "prebuilt-read",
      pageBuffer,
    );

    const result = await poller.pollUntilDone();

    return result;
  }

  const pdfData = await extractTextFromPdfPage(pdfPageBuffer);

  return pdfData;
}

async function getPdfForIndividualPage(pdfPath, pageNumber) {
  const existingPdfBytes = fs.readFileSync(pdfPath);

  // Load a PDFDocument from the existing PDF bytes
  const pdfDoc = await PDFDocument.load(existingPdfBytes);

  // Get the total number of pages
  const pageCount = pdfDoc.getPageCount();

  if (pageNumber > pageCount - 1) {
    throw new Error(
      `Page number ${pageNumber} is greater than the number of pages in the document`,
    );
  }

  // Create a new PDFDocument
  const newPdf = await PDFDocument.create();

  // Copy the current page
  const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageNumber]);

  // Add the copied page to the new PDF
  newPdf.addPage(copiedPage);

  // Save the single-page PDF as a buffer
  const pdfBytes = await newPdf.save();

  const pageBuffer = Buffer.from(pdfBytes);
  // Add the stream to the array

  return pageBuffer;
}

async function extractTextContentFromPdfData(pdfData) {
  let output = "";

  const page = pdfData.pages[0];

  for (const line of page.lines) {
    const isFirstLine = page.lines.indexOf(line) === 0;
    const isLastLine = page.lines.indexOf(line) === page.lines.length - 1;
    // avoid page numbers
    const textIsInteger = /^\d+$/.test(line.content);
    if (textIsInteger && (isFirstLine || isLastLine)) {
      continue;
    }
    output += line.content;
    // if the line ends with a hyphen, don't add a newline
    const endsWithHyphen = line.content.endsWith("-");
    if (endsWithHyphen) {
      // delete the hyphen
      output = output.slice(0, -1);
    } else {
      output += "\n";
    }
  }

  return output;
}

async function extractTextFromPdfPage(pdfPath, pageNumber) {
  const pdfPageBuffer = await getPdfForIndividualPage(pdfPath, pageNumber);

  // save the buffer to a temp file

  await fs.promises.writeFile("./temp.pdf", pdfPageBuffer);

  const pdfData = await extractTextFromPdf(pdfPageBuffer);

  // save the data to a temp file
  await fs.promises.writeFile("./temp.json", JSON.stringify(pdfData, null, 2));

  const pageContent = await extractTextContentFromPdfData(pdfData);

  // save the page content to a temp file
  await fs.promises.writeFile("./temp.txt", pageContent);

  return pageContent;
}

async function extractAllTextFromPdf(pdfPath) {
  // get page count
  const existingPdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pageCount = pdfDoc.getPageCount();

  const pageNumbers = Array.from({ length: pageCount }, (_, i) => i);

  const pdfPagesText = await pMap(
    pageNumbers,
    async (pageNumber) => {
      return await extractTextFromPdfPage(pdfPath, pageNumber);
    },
    { concurrency: 2 },
  );

  const pdfText = pdfPagesText.join("\n");

  const pdfFilename = path.basename(pdfPath, ".pdf");
  const outputFolderName = "extracted";
  if (!fs.existsSync(outputFolderName)) {
    fs.mkdirSync(outputFolderName);
  }
  const outputFileName = `${pdfFilename}.txt`;
  const outputFilePath = path.join(outputFolderName, outputFileName);
  fs.writeFileSync(outputFilePath, pdfText);
  console.log(outputFilePath);
  return;
}

// Example usage
// node extract-text-from-pdf.js ./my-pdf.pdf 0
const [pdfPath, pageNumberStr] = process.argv.slice(2);
const pageNumber = pageNumberStr ? parseInt(pageNumberStr) : null;
if (pageNumber) {
  console.log({ pdfPath, pageNumber });
  const text = await extractTextFromPdfPage(pdfPath, pageNumber);
  const pdfFilename = path.basename(pdfPath, ".pdf");
  const outputFileName = `${pdfFilename}_${pageNumber}.txt`;
  fs.writeFileSync(`./${outputFileName}`, text);
} else {
  await extractAllTextFromPdf(pdfPath);
}
process.exit(0);
