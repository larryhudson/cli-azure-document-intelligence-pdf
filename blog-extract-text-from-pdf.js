import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import {
  DocumentAnalysisClient,
  AzureKeyCredential,
} from "@azure/ai-form-recognizer";
import "dotenv/config";
import pMap from "p-map";

// Example usage:
// node extract-text-from-pdf.js ./my-pdf.pdf
const [pdfPath] = process.argv.slice(2);
const extractedPages = await extractTextFromFullPdf(pdfPath);
console.log(extractedPages);
const pdfFilename = path.basename(pdfPath, ".pdf");
writeTextFiles(extractedPages, pdfFilename);

// this function takes a PDF path, and for each page, creates an individual PDF
// and extracts the text using the Document Intelligence API
async function extractTextFromFullPdf(pdfPath) {
  const fullPdfBytes = fs.readFileSync(pdfPath);
  const fullPdfDoc = await PDFDocument.load(fullPdfBytes);
  const pageCount = fullPdfDoc.getPageCount();

  const pageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1);

  const extractedPages = await pMap(
    pageNumbers,
    async (pageNumber) => {
      const pdfPageBuffer = await getPdfForIndividualPage(pdfPath, pageNumber);

      const pdfData = await extractTextFromPagePdf(pdfPageBuffer);

      const content = pdfData.content;
      return { pageNumber, content };
    },
    { concurrency: 2 },
  );

  return extractedPages;
}

// the Document Intelligence API only supports extracting text from a single
// page at a time, so this function creates a new PDF for a single page
async function getPdfForIndividualPage(pdfPath, pageNumber) {
  const existingPdfBytes = fs.readFileSync(pdfPath);

  const fullPdfDoc = await PDFDocument.load(existingPdfBytes);

  const singlePagePdf = await PDFDocument.create();

  const pageIndex = pageNumber - 1;
  const [copiedPage] = await singlePagePdf.copyPages(fullPdfDoc, [pageIndex]);
  singlePagePdf.addPage(copiedPage);

  const singlePagePdfBytes = await singlePagePdf.save();
  const singlePagePdfBuffer = Buffer.from(singlePagePdfBytes);
  return singlePagePdfBuffer;
}

// this function takes a PDF buffer and sends it to the Document Intelligence
// API and returns the result
async function extractTextFromPagePdf(pdfPageBuffer) {
  // environment variables should be in .env file
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

  const documentAnalysisClient = new DocumentAnalysisClient(
    endpoint,
    new AzureKeyCredential(apiKey),
  );

  const poller = await documentAnalysisClient.beginAnalyzeDocument(
    "prebuilt-read",
    pdfPageBuffer,
  );

  const pdfDataResult = await poller.pollUntilDone();

  return pdfDataResult;
}

// this function writes a text file for each page of the PDF
function writeTextFiles(extractedPages, pdfFilename) {
  const outputFolderName = "extracted-pages";
  if (!fs.existsSync(outputFolderName)) {
    fs.mkdirSync(outputFolderName);
  }

  for (const { pageNumber, content } of extractedPages) {
    const txtFilename = `${pdfFilename}_${pageNumber}.txt`;
    const txtFilePath = path.join(outputFolderName, txtFilename);
    console.log(`Writing ${txtFilePath}`);
    fs.writeFileSync(txtFilePath, content);
  }
}
