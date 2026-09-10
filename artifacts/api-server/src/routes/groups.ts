import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { CreateGroupBody, JoinGroupBody, ListGroupMessagesParams, SendGroupMessageBody, SendGroupMessageParams } from "@workspace/api-zod";
import { db, groupMembersTable, groupMessagesTable, groupsTable } from "@workspace/db";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

function createInviteCode() {
  return randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

function accessResponse(group: { id: string; name: string; inviteCode: string }, memberId: string, displayName: string) {
  return { id: group.id, name: group.name, inviteCode: group.inviteCode, memberId, displayName };
}

router.post("/groups", async (req, res) => {
  const parsed = CreateGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Informe o nome do grupo e seu nome." });
    return;
  }

  const group = {
    id: randomUUID(),
    name: parsed.data.name.trim(),
    inviteCode: createInviteCode(),
  };
  const memberId = randomUUID();

  await db.insert(groupsTable).values(group);
  await db.insert(groupMembersTable).values({
    groupId: group.id,
    memberId,
    displayName: parsed.data.displayName.trim(),
  });
  res.status(201).json(accessResponse(group, memberId, parsed.data.displayName.trim()));
});

router.post("/groups/join", async (req, res) => {
  const parsed = JoinGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Informe o código do convite e seu nome." });
    return;
  }

  const [group] = await db
    .select()
    .from(groupsTable)
    .where(eq(groupsTable.inviteCode, parsed.data.inviteCode.trim().toUpperCase()))
    .limit(1);
  if (!group) {
    res.status(404).json({ error: "Esse código de convite não existe." });
    return;
  }

  const memberId = randomUUID();
  await db.insert(groupMembersTable).values({
    groupId: group.id,
    memberId,
    displayName: parsed.data.displayName.trim(),
  });
  res.json(accessResponse(group, memberId, parsed.data.displayName.trim()));
});

router.get("/groups/:groupId/messages", async (req, res) => {
  const parsed = ListGroupMessagesParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Grupo inválido." });
    return;
  }

  const messages = await db
    .select()
    .from(groupMessagesTable)
    .where(eq(groupMessagesTable.groupId, parsed.data.groupId))
    .orderBy(asc(groupMessagesTable.createdAt))
    .limit(100);
  res.json(messages);
});

router.post("/groups/:groupId/messages", async (req, res) => {
  const path = SendGroupMessageParams.safeParse(req.params);
  const body = SendGroupMessageBody.safeParse(req.body);
  if (!path.success || !body.success) {
    res.status(400).json({ error: "Mensagem inválida." });
    return;
  }

  const [member] = await db
    .select()
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, path.data.groupId), eq(groupMembersTable.memberId, body.data.memberId)))
    .limit(1);
  if (!member) {
    res.status(403).json({ error: "Você não participa deste grupo." });
    return;
  }

  const [message] = await db
    .insert(groupMessagesTable)
    .values({
      groupId: path.data.groupId,
      memberId: member.memberId,
      displayName: member.displayName,
      content: body.data.content.trim(),
    })
    .returning();
  res.status(201).json(message);
});

export default router;