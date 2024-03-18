import * as cheerio from "cheerio";
import { program } from "commander";
import chalk from "chalk";

import * as http from "./lib/http-client.js";
import { version } from "../package.json";

const main = async () => {
  program
    .version(version, "-v, --version")
    .description("A simple HTTP client that displays human-readable content")
    .option("-u, --url <url>", "URL to fetch and display content")
    .option(
      "-s, --search <term>",
      "Search term to query a search engine and display top results"
    )
    .parse();

  const options = program.opts();

  if (!options.url && !options.search) {
    program.help();
    return;
  }

  if (options.url) {
    try {
      const response = await http.get(options.url);
      console.log(chalk.green(parseHtml(response.body)));
    } catch (error) {
      console.error(chalk.red("Error fetching URL:", error));
    }
  } else if (options.search) {
    const searchUrl = getSearchEngineUrl(options.search); // Replace with your preferred search engine logic
    try {
      const response = await http.get(searchUrl);
      const topResults = parseSearchResults(response.body);
      console.log(chalk.bold.cyan("Top 10 results:"));
      topResults.forEach((result, index) =>
        console.log(`${index + 1}. ${result}`)
      );
    } catch (error) {
      console.error(chalk.red("Error fetching search results:", error));
    }
  }
};

function parseHtml(html: string): string {
  const $ = cheerio.load(html);
  const text = $("h1, h2, h3, h4, h5, h6, p")
    .toArray()
    .map((header) => {
      const textContent = $(header).text();
      if (header.tagName === "h1")
        return chalk.bold.white.underline(textContent);
      if (header.tagName === "h2") return chalk.bold.white(textContent);
      if (header.tagName === "h3") return chalk.bold.yellow(textContent);
      if (header.tagName === "h4") return chalk.bold.green(textContent);
      if (header.tagName === "h5") return chalk.bold.blue(textContent);
      if (header.tagName === "h6") return chalk.bold.magenta(textContent);
      return textContent;
    })
    .filter((text) => text.trim().length > 0)
    .join("\n");
  return text;
}

const getSearchEngineUrl = (searchTerm: string) => {
  return `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`;
};

const parseSearchResults = (html: string) => {
  const $ = cheerio.load(html);
  const headers = $("a > h3");
  const anchors = headers.parent();
  const results = anchors
    .map(
      (_, anchor) =>
        `${chalk.green($(anchor).find("h3").text())} - ${$(anchor).attr(
          "href"
        )}`
    )
    .get();
  return results.slice(0, 10); // Get top 10 results
};

main();
