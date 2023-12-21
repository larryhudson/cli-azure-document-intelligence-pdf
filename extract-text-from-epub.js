import AdmZip from "adm-zip";
import fg from "fast-glob";
import fs from "fs";
import path from "path";
import cheerio from "cheerio";

const [epubFilePath] = process.argv.slice(2);
const tmpFolderPath = unzipEpubFile(epubFilePath);
const tocFilePath = await findTocFile(tmpFolderPath);
const bookmarks = getBookmarksfromToc(tocFilePath);
const htmlPaths = await findHtmlFiles(tmpFolderPath);
writeBookmarksToJson(bookmarks);
const bookmarksWithContent = await getContentForBookmarks(bookmarks, htmlPaths);
writeBookmarksToTextFiles(bookmarks);

function unzipEpubFile(epubFilePath) {
  const zip = new AdmZip(epubFilePath);
  const tmpFolderName = "tmp-zip";
  zip.extractAllTo(tmpFolderName);
  return tmpFolderName;
}

async function findTocFile(tmpFolderPath) {
  const tocFilePaths = await fg(`${tmpFolderPath}/**/*.ncx`);

  if (tocFilePaths.length === 0) {
    throw new Error("Could not find toc file");
  }

  return tocFilePaths[0];
}

async function findHtmlFiles(tmpFolderPath) {
  const htmlFilePaths = await fg(`${tmpFolderPath}/**/*.html`);

  return htmlFilePaths;
}

function getBookmarksfromToc(tocFilePath) {
  const tocFolder = path.dirname(tocFilePath);
  const tocContent = fs.readFileSync(tocFilePath, "utf8");
  const $ = cheerio.load(tocContent, { xmlMode: true });
  const navPoints = $("navMap > navPoint");
  const bookmarks = navPoints
    .map((i, navPoint) => {
      const $navPoint = $(navPoint);
      const title = $navPoint.find("text").first().text();
      const undecodedPath = $navPoint.find("content").attr("src");
      const absolutePath = path.join(
        tocFolder,
        decodeURIComponent(undecodedPath),
      );
      const number = i + 1;
      const children = $navPoint.find("navPoint");
      if (children.length > 0) {
        const childBookmarks = children
          .map((childI, navPoint) => {
            const $navPoint = $(navPoint);
            const title = $navPoint.find("text").first().text();
            const undecodedPath = $navPoint.find("content").attr("src");
            const absolutePath = path.join(
              tocFolder,
              decodeURIComponent(undecodedPath),
            );
            const number = childI + 1;
            return { title, path: absolutePath, number };
          })
          .get();
        return { title, path: absolutePath, number, children: childBookmarks };
      }
      return { title, number, path: absolutePath };
    })
    .get();
  return bookmarks;
}

function convertHtmlToText(html) {
  // get the text for each tag and join with newlines
  const $ = cheerio.load(html);
  const $body = $("body");
  const $elements = $body.children();

  const text = $elements
    .map((i, element) => {
      return $(element).text();
    })
    .get()
    .join("\n");

  return text;
}

async function getContentForBookmarks(
  bookmarks,
  htmlPaths,
  nextParentBookmark = null,
) {
  for (const thisBookmark of bookmarks) {
    const nextBookmark = bookmarks.find(
      (b) => b.number === thisBookmark.number + 1,
    );
    if (nextBookmark) {
      console.log({ thisBookmark, nextBookmark });
      const { html, text } = await getContentBetweenBookmarks(
        htmlPaths,
        thisBookmark,
        nextBookmark,
      );
      thisBookmark.html = html;
      thisBookmark.text = text;
    } else {
      if (nextParentBookmark) {
        const { html, text } = await getContentBetweenBookmarks(
          htmlPaths,
          thisBookmark,
          nextParentBookmark,
        );
        thisBookmark.html = html;
        thisBookmark.text = text;
      } else {
        // there is no next bookmark, so we just get the content after this anchor
        const [filename, anchorId] = thisBookmark.path.split("#");
        const html = getHtmlFromContentFile(filename);
        const content = getHtmlAfterAnchor(html, anchorId);
        const text = convertHtmlToText(html);
        thisBookmark.html = content;
        thisBookmark.text = text;
      }
    }

    if (thisBookmark.children) {
      // need to get combined html for just this bookmark's children
      thisBookmark.children = await getContentForBookmarks(
        thisBookmark.children,
        htmlPaths,
        nextBookmark,
      );
    }
  }

  return bookmarks;
}

function getHtmlFromContentFile(contentFilePath) {
  const content = fs.readFileSync(contentFilePath, "utf8");
  const $ = cheerio.load(content);
  const body = $("body").html();
  return body;
}

function writeBookmarksToJson(bookmarks) {
  const jsonFilePath = "bookmarks.json";
  fs.writeFileSync(jsonFilePath, JSON.stringify(bookmarks, null, 2));
}

function getTitleForBookmark(bookmarks, bookmark, parentBookmark = null) {
  const bookmarkNumber = bookmark.number;
  const bookmarkTitle = bookmark.title;
  const bookmarkText = `${bookmarkNumber}. ${bookmarkTitle}`;
  if (parentBookmark) {
    const parentTitle = getTitleForBookmark(bookmarks, parentBookmark);
    return `${parentTitle} - ${bookmarkText}`;
  } else {
    return bookmarkText;
  }
}

function writeBookmarksToTextFiles(bookmarks, parentBookmark = null) {
  bookmarks.forEach((bookmark, index) => {
    const bookmarkTextFilename = getTitleForBookmark(
      bookmarks,
      bookmark,
      parentBookmark,
    );
    // text file should be prefixed with parent's title
    const bookmarkTextFilePath = `${bookmarkTextFilename}.txt`;
    const escapedPath = bookmarkTextFilePath
      .replace(/:/g, "-")
      .replace(/\//g, "-");
    fs.writeFileSync(escapedPath, bookmark.text);
    if (bookmark.children) {
      writeBookmarksToTextFiles(bookmark.children, bookmark);
    }
  });
}

async function getContentBetweenBookmarks(pagesList, bookmark1, bookmark2) {
  const path1 = bookmark1.path;
  const path2 = bookmark2.path;

  console.log("Trying to get the content between");
  console.log(path1);
  console.log(path2);

  const [filename1, anchorId1] = path1.split("#");
  const [filename2, anchorId2] = path2.split("#");

  const isSameFile = filename1 === filename2;

  if (isSameFile) {
    const html = getHtmlFromContentFile(filename1);
    const content = getHtmlBetweenAnchors(html, path1, path2);
    const text = convertHtmlToText(content);
    return { html, text };
  }

  let html = "";

  if (!anchorId1 && !anchorId2) {
    // just get the html from the first file
    const html = getHtmlFromContentFile(filename1);
    const text = convertHtmlToText(html);
    return { html, text };
  }

  const html1 = getHtmlFromContentFile(filename1);

  // console.log("Content in file", filename1);
  // console.log(html1);
  //
  const content1 = getHtmlAfterAnchor(html1, anchorId1);

  if (content1) {
    html += content1;
  }

  // check if there are pages between the two bookmarks (eg. bookmark1 is split_029.html and bookmark2 is split_031.html)
  const bookmark1PageIndex = pagesList.findIndex(
    (htmlPath) => htmlPath === filename1,
  );
  const bookmark2PageIndex = pagesList.findIndex(
    (htmlPath) => htmlPath === filename2,
  );

  const pagesBetween = pagesList.slice(
    bookmark1PageIndex + 1,
    bookmark2PageIndex,
  );

  console.log("Pages between", pagesBetween);

  if (pagesBetween.length > 0) {
    for (const htmlPath of pagesBetween) {
      const htmlContent = getHtmlFromContentFile(htmlPath);
      html += htmlContent;
    }
  }

  const html2 = getHtmlFromContentFile(filename2);
  if (anchorId2) {
    const content2 = getHtmlBeforeAnchor(html2, anchorId2);
    html += content2;
  }

  const text = convertHtmlToText(html);

  return { html, text };
}

function getHtmlBeforeAnchor(html, anchorId) {
  const htmlWithBody = `<html><body>${html}</body></html>`;
  const $ = cheerio.load(htmlWithBody);
  const $anchor = $(`#${anchorId}`);
  // get the anchor's top-level parent
  const $anchorParent = $anchor.parentsUntil("body").last();
  console.log({ $anchorParent });
  const $firstElement = $("body > *").first();
  console.log({ $firstElement });
  const $elementsBefore = $firstElement.nextUntil($anchorParent).addBack();

  const htmlBefore = $.html($elementsBefore);
  return htmlBefore;
}

function getHtmlAfterAnchor(html, anchorId) {
  const htmlWithBody = `<html><body>${html}</body></html>`;
  const $ = cheerio.load(htmlWithBody);
  const $anchor = $(`#${anchorId}`);
  const $anchorParent = $anchor.parentsUntil("body").last();

  const $lastElement = $("body > *").last();

  const $elementsAfter = $anchorParent.nextUntil($lastElement).addBack();

  const htmlAfter = $.html($elementsAfter);
}

function getHtmlBetweenAnchors(html, fromAnchorId, toAnchorId) {
  const htmlWithBody = `<html><body>${html}</body></html>`;
  const $ = cheerio.load(htmlWithBody);

  const $fromAnchor = $(`#${fromAnchorId}`);
  const $toAnchor = $(`#${toAnchorId}`);

  const $fromAnchorParent = $fromAnchor.parentsUntil("body").last();
  const $toAnchorParent = $toAnchor.parentsUntil("body").last();

  const $elementsBetween = $fromAnchorParent.nextUntil($toAnchorParent);

  const htmlBetween = $.html($elementsBetween);

  return htmlBetween;
}

// function getHtmlBetweenAnchorsOld(combinedHtml, path1, path2) {
//   const $ = cheerio.load(combinedHtml);
//   const [filename1, anchor1] = path1.split("#");
//   const id1 = slugify(filename1);
//
//   const selector1 = anchor1 ? `#${anchor1}` : `#${id1}`;
//   console.log({ selector1 });
//   let selector2;
//
//   const $anchor1 = $(selector1);
//   console.log({ $anchor1 });
//
//   let contentElements = [];
//
//   if (path2) {
//     const [filename2, anchor2] = path2.split("#");
//     const id2 = slugify(filename2);
//     selector2 = anchor2 ? `#${anchor2}` : `#${id2}`;
//     console.log({ selector2 });
//     const $anchor2 = $(selector2);
//     console.log({ $anchor2 });
//
//     const anchor1IsSplit = $anchor1.hasClass("page_split");
//     const anchor2IsSplit = $anchor2.hasClass("page_split");
//
//     const $pageSplit1 = $anchor1.closest(".page_split");
//     const $pageSplit2 = $anchor2.closest(".page_split");
//     const $anchor1Container = anchor1IsSplit
//       ? $anchor1
//       : $anchor1.parentsUntil($pageSplit1).last();
//
//     console.log({ $anchor1Container });
//     const $anchor2Container = anchor2IsSplit
//       ? $anchor2
//       : $anchor2.parentsUntil($pageSplit2).last();
//
//     console.log({ $anchor2Container });
//
//     const isSamePageSplit = $pageSplit1.is($pageSplit2);
//     if (isSamePageSplit) {
//       const $elementsBetween = $anchor1Container.nextUntil($anchor2Container);
//       console.log({ $elementsBetween });
//       contentElements.push(...$elementsBetween.toArray());
//     } else {
//       // get anchor1's parent inside the page split
//       const $elementsInSplit1 = $anchor1Container.nextAll();
//       console.log({ $elementsInSplit1 });
//       contentElements.push(...$elementsInSplit1.toArray());
//       const $pageSplitsInBetween = $pageSplit1.nextUntil($pageSplit2);
//       console.log({ $pageSplitsInBetween });
//       const $elementsInPageSplitsInBetween = $pageSplitsInBetween
//         .find(".page_split > *")
//         .toArray();
//       contentElements.push(...$elementsInPageSplitsInBetween);
//       const $elementsInSplit2 = $anchor2Container.prevAll();
//       console.log({ $elementsInSplit2 });
//       contentElements.push(...$elementsInSplit2.toArray());
//     }
//   } else {
//     const $pageSplit1 = $anchor1.closest(".page_split");
//     const $anchor1Container = $anchor1.closest(".page_split > *");
//     const $elementsInSplit1 = $anchor1Container.nextAll();
//     contentElements.push(...$elementsInSplit1.toArray());
//     const $pageSplitsAfter = $pageSplit1.nextAll();
//     if ($pageSplitsAfter.length > 0) {
//       const $elementsInPageSplitsAfter =
//         $pageSplitsAfter.find(".page_split > *");
//
//       if ($elementsInPageSplitsAfter.length > 0) {
//         contentElements.push(...$elementsInPageSplitsAfter.toArray());
//       }
//     }
//   }
//
//   const $content = $(contentElements);
//   const html = $content.html();
//   console.log({ html });
//
//   return html;
// }

// // replace all punctuation with dashes
// function slugify(text) {
//   return text
//     .toLowerCase()
//     .replace(/[^a-z0-9]+/g, "-")
//     .replace(/^-/, "")
//     .replace(/-$/, "");
// }

// function combineHtmlFiles(htmlPaths) {
//   const htmls = htmlPaths.map((htmlPath) => {
//     // const extname = path.extname(htmlPath);
//     const filename = path.basename(htmlPath);
//     const html = getHtmlFromContentFile(htmlPath);
//
//     return { filename, html };
//   });
//
//   // create a new html file with cheerio
//   const $ = cheerio.load("<html><body></body></html>");
//   const $body = $("body");
//   htmls.forEach(({ filename, html }) => {
//     const id = slugify(filename);
//     $body.append(`<div class="page_split" id="${id}">${html}</div>`);
//   });
//
//   const combinedHtml = $.html();
//   return combinedHtml;
// }
