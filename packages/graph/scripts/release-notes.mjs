import assert from "node:assert/strict";

export function extractReleaseNotes(changelog, version, packageName = "the package") {
  assert.equal(typeof changelog, "string", `The changelog for ${packageName} must be text.`);
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Release Please omits the comparison link when a component has no previous release.
  const headingPattern = new RegExp(
    `^## (?:\\[${escapedVersion}\\](?:\\([^\\r\\n]*\\))?|${escapedVersion})(?=[ \\t]|$)[^\\r\\n]*$`,
    "m"
  );
  const heading = changelog.match(headingPattern);
  assert.ok(heading?.index !== undefined, `The changelog for ${packageName} must contain version ${version}.`);

  const notesStart = heading.index + heading[0].length;
  const nextHeading = changelog.slice(notesStart).search(/^## /m);
  const notesEnd = nextHeading === -1 ? changelog.length : notesStart + nextHeading;
  const notes = changelog.slice(notesStart, notesEnd).trim();
  assert.notEqual(notes, "", `The changelog entry for ${packageName}@${version} must contain release notes.`);

  return notes;
}
