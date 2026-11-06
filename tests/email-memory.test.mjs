import test from "node:test";
import assert from "node:assert/strict";
import { createEmailMemory } from "../web/scripts/email-memory.js";

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test("草稿存了讀得回來", () => {
  const mem = createEmailMemory(fakeStorage());
  mem.saveDraft("a@b.co");
  assert.deepEqual(mem.load(), { email: "a@b.co", sent: false });
});

test("送出後記成已送，草稿不再算", () => {
  const store = fakeStorage();
  const mem = createEmailMemory(store);
  mem.saveDraft("a@b.co");
  mem.markSent("a@b.co");
  assert.deepEqual(createEmailMemory(store).load(), { email: "a@b.co", sent: true });
});

test("沒存過就是空的", () => {
  assert.deepEqual(createEmailMemory(fakeStorage()).load(), { email: "", sent: false });
});

test("storage 丟錯（無痕模式）不會炸", () => {
  const broken = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
  const mem = createEmailMemory(broken);
  mem.saveDraft("a@b.co");
  mem.markSent("a@b.co");
  assert.deepEqual(mem.load(), { email: "", sent: false });
});

test("沒有 storage（Node）也不會炸", () => {
  const mem = createEmailMemory(undefined);
  mem.saveDraft("a@b.co");
  assert.deepEqual(mem.load(), { email: "", sent: false });
});
