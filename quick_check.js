import { chromium } from "playwright";
import path from "path";

async function test() {
  const profileDir = path.resolve("./.user-data/fb-profile");
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: true
  });
  const page = await ctx.newPage();
  await page.goto("https://www.facebook.com/groups/muabanbatdongsanecopark/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  console.log("URL:", page.url());
  console.log("Title:", await page.title());
  const body = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log("Body preview:", body);
  await ctx.close();
}
test().catch(e => console.error(e));