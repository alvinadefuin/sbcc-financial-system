const fs = require("fs");
const path = require("path");

// The report service exists twice: backend/services (Express, local dev) and
// api/_lib (Vercel, production). They must stay identical apart from comments.
const BACKEND = path.join(__dirname, "reportService.js");
const API = path.join(__dirname, "../../api/_lib/reportService.js");

const normalize = (src) =>
  src
    .split("\n")
    .map((line) =>
      line
        .replace(/\s+\/\/.*$/, "")
        .replace(/^\s*\/\/.*$/, "")
        .trimEnd()
    )
    .filter((line) => line.trim() !== "")
    .join("\n");

test("both reportService copies are identical apart from comments", () => {
  const backend = normalize(fs.readFileSync(BACKEND, "utf8"));
  const api = normalize(fs.readFileSync(API, "utf8"));
  expect(api).toBe(backend);
});

test("both copies export the same surface", () => {
  const backend = require("./reportService");
  const api = require("../../api/_lib/reportService");
  expect(Object.keys(api).sort()).toEqual(Object.keys(backend).sort());
});
