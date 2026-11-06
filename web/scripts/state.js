/** 測驗狀態。一律回傳新物件，不改動傳進來的那一個。 */
import { QUESTIONS } from "./config.js";

export const INITIAL = Object.freeze({
  step: 0,
  answers: Object.freeze({}),
});

export function currentQuestion(state) {
  return QUESTIONS[state.step] ?? null;
}

export function isDone(state) {
  return state.step >= QUESTIONS.length;
}

export function answer(state, value) {
  const question = currentQuestion(state);
  if (!question) throw new Error("測驗已結束，沒有可以作答的題目");
  if (!question.options.some((o) => o.value === value)) {
    throw new Error(`「${question.key}」沒有這個選項：${value}`);
  }
  return Object.freeze({
    step: state.step + 1,
    answers: Object.freeze({ ...state.answers, [question.key]: value }),
  });
}

export function back(state) {
  if (state.step === 0) return state;
  const step = state.step - 1;
  const answers = { ...state.answers };
  delete answers[QUESTIONS[step].key];
  return Object.freeze({ step, answers: Object.freeze(answers) });
}
