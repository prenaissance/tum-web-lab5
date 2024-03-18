import * as http from "./lib/http-client.js";
import * as cheerio from "cheerio"; // Assuming cheerio is installed using npm or yarn
import { program } from "commander";
import chalk from "chalk"; // Assuming chalk is installed using npm or yarn

const main = async () => {
  program
    .version("0.1.0")
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
      console.log(chalk.green(parseHtml(response)));
    } catch (error) {
      console.error(chalk.red("Error fetching URL:", error));
    }
  } else if (options.search) {
    const searchUrl = getSearchEngineUrl(options.search); // Replace with your preferred search engine logic
    try {
      const response = await http.get(searchUrl);
      const topResults = parseSearchResults(response);
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
  const text = $.text().trim(); // Remove leading/trailing whitespace
  return text;
}

// Replace this with your preferred logic to construct a search URL based on the search term
function getSearchEngineUrl(searchTerm: string): string {
  // Example: Google search
  return `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`;
}

function parseSearchResults(html: string): string[] {
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
}

main();
