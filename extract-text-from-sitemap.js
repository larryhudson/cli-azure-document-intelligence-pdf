import cheerio from "cheerio";
import fs from "fs";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

function writeArticleToTextFile(url, article) {
  const timestamp = new Date().toISOString();
  const jsonFilename = `${url.replaceAll("/", "-")}_${timestamp}.json`;
  const textFilename = `${url.replaceAll("/", "-")}_${timestamp}.txt`;
  fs.writeFileSync(jsonFilename, JSON.stringify(article, null, 2));
  fs.writeFileSync(textFilename, article.textContent);
}

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

const [sitemapUrl] = process.argv.slice(2);
const links = await getLinksFromSitemap(sitemapUrl);
for (const { url } of links) {
  try {
    const article = await extractContent(url);
    writeArticleToTextFile(url, article);
  } catch (error) {
    console.error(error);
  }
}

async function getLinksFromSitemap(sitemapUrl) {
  const sitemapResponse = await fetch(sitemapUrl, {
    headers: {
      "Accept-Charset": "utf-8",
    },
  });
  if (!sitemapResponse.ok) {
    const errorText = await sitemapResponse.text();
    const responseStatus = sitemapResponse.status;
    throw new Error(`Error ${responseStatus} ${errorText}`);
  }
  const sitemapHtml = await sitemapResponse.text();

  const $ = cheerio.load(sitemapHtml);

  const sitemapContainer = $("main > .sitemap > #readspeak > .sitemap");

  // base url should be the sitemap url, up until the third slash
  const baseUrl = sitemapUrl.split("/").slice(0, 3).join("/");

  const links = sitemapContainer
    .find("a")
    .map((i, el) => {
      const href = $(el).attr("href");
      const url = href.startsWith("/") ? `${baseUrl}${href}` : href;
      const title = $(el).text();
      return { title, url };
    })
    .get();

  console.log(links);

  return links;
}
