import { invoke } from "@tauri-apps/api/core";
import type { CodexDoctorResult } from "../../types";

export async function runCodexDoctor(
  codexBin: string | null,
  codexArgs: string | null,
): Promise<CodexDoctorResult> {
  return invoke<CodexDoctorResult>("codex_doctor", { codexBin, codexArgs });
}

export async function runClaudeDoctor(
  claudeBin: string | null,
): Promise<CodexDoctorResult> {
  return invoke<CodexDoctorResult>("claude_doctor", { claudeBin });
}
