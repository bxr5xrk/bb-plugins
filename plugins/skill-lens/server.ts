import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { listSkillFiles, readSkillFile } from "./lib/skill-files";
import { collectUsage, type Usage } from "./lib/usage";

const skillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  scope: z.string(),
  provider: z.string().nullable(),
  pluginId: z.string().nullable(),
  root: z.string(),
  realRoot: z.string(),
});
export type SkillRow = z.infer<typeof skillSchema>;

const countsSchema = z.record(z.string(), z.number());

const fileSchema = z.object({ path: z.string(), size: z.number() });
export type SkillFileRow = z.infer<typeof fileSchema>;

export const rpcContract = defineRpcContract({
  listSkills: {
    input: z.null(),
    output: z.object({ skills: z.array(skillSchema), home: z.string() }),
  },
  usage: {
    input: z.null(),
    output: z.object({ claude: countsSchema, codex: countsSchema, cursor: countsSchema }),
  },
  listFiles: {
    input: z.object({ skillId: z.string() }),
    output: z.object({ files: z.array(fileSchema), truncated: z.boolean() }),
  },
  readFile: {
    input: z.object({ skillId: z.string(), path: z.string() }),
    output: z.object({ size: z.number(), binary: z.boolean(), content: z.string().nullable() }),
  },
});

export default (bb: BbPluginApi) => {
  const listSkills = async () => {
    const projects = await bb.sdk.projects.list({ includePersonal: true });
    const personal = projects.find((project) => project.kind === "personal");
    if (!personal) throw new Error("Personal project not found.");
    const { skills } = await bb.sdk.skills.list({ projectId: personal.id, environmentId: null });
    return Promise.all(
      skills.map(async (skill) => {
        const root = dirname(skill.filePath);
        return {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          scope: skill.scope,
          provider: skill.provider,
          pluginId: skill.pluginId,
          root,
          realRoot: await realpath(root),
        };
      }),
    );
  };

  let usage: { at: number; value: Promise<Usage> } | null = null;
  const cachedUsage = () => {
    if (!usage || Date.now() - usage.at > 5 * 60 * 1000) usage = { at: Date.now(), value: collectUsage() };
    return usage.value;
  };

  const skillRoot = async (skillId: string) => {
    const skill = (await listSkills()).find((item) => item.id === skillId);
    if (!skill) throw new Error("Skill not found.");
    return skill.root;
  };

  bb.rpc.register(rpcContract, {
    listSkills: async () => ({ skills: await listSkills(), home: homedir() }),
    usage: cachedUsage,
    listFiles: async ({ skillId }) => listSkillFiles(await skillRoot(skillId)),
    readFile: async ({ skillId, path }) => readSkillFile(await skillRoot(skillId), path),
  });
};
