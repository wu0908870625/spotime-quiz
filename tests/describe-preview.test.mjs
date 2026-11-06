import { test } from "node:test";
import assert from "node:assert/strict";
import { describePreview } from "../web/scripts/preview.js";

test("相機螢幕的描述照答題進度長出來", () => {
  assert.equal(describePreview({}), "相機螢幕");
  assert.equal(describePreview({ shape: "star" }), "相機螢幕，星星造型貼");
  assert.equal(describePreview({ shape: "star", scene: "concert", position: "cheek" }), "相機螢幕，場景：演唱會，星星造型貼，貼在臉頰");
});

test("不認得的值不會念出 undefined", () => {
  assert.equal(describePreview({ shape: "nope", scene: "concert" }), "相機螢幕，場景：演唱會");
});
