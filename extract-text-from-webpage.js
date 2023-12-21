import fs from "fs";
import cheerio from "cheerio";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const [webpageUrl] = process.argv.slice(2);
const article = await extractContent(webpageUrl);
const timestamp = new Date().toISOString();
const jsonFilename = `${webpageUrl.replaceAll("/", "-")}_${timestamp}.json`;
const textFilename = `${webpageUrl.replaceAll("/", "-")}_${timestamp}.txt`;
fs.writeFileSync(jsonFilename, JSON.stringify(article, null, 2));
fs.writeFileSync(textFilename, article.textContent);

export async function extractContent(url) {
  const pageResponse = await fetch(url, {
    headers: {
      "Accept-Charset": "utf-8",
    },
  });

  if (!pageResponse.ok) {
    const errorText = await pageResponse.text();
    const responseStatus = pageResponse.status;
    throw new Error(`Error ${responseStatus} ${errorText}`);
  }

  const pageHtml = await pageResponse.text();

  const dom = new JSDOM(pageHtml, {
    url,
  });

  const reader = new Readability(dom.window.document, {
    debug: true,
  });

  const article = reader.parse();

  return article;
}
