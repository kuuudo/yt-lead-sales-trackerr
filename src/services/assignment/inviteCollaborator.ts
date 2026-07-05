/**
 * src/services/assignment/inviteCollaborator.ts
 *
 * Creates an invitation for an Assignment. Per Design Lock, this works
 * whether or not the invited email has a VS-Track account yet — identity
 * is resolved later, at accept time (accept_assignment_invitation checks
 * invited_email against the accepting user's profile email).
 *
 * invitation_token is generated here, client-side: the column is NOT NULL
 * with no DB default (confirmed against the schema dump), so something
 * has to set it before insert.
 *
 * NOT responsible for:
 *   - Actually delivering the invitation (email/SMS). That's
 *     infrastructure, explicitly out of scope for this domain — same as
 *     already agreed for the dropped reconciliation trigger.
 */

import { supabase } from '../../lib/supabase';

function generateInvitationToken(): string {
  // 32 hex chars — long enough that this being unguessable actually matters
  // (unlike the 4-char redirect short codes, this token could be used to
  // silently claim a collaboration relationship if guessed).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export interface InviteCollaboratorInput {
  assignmentId: string;
  invitedByUserId: string;
  invitedEmail: string;
}

export interface InviteCollaboratorResult {
  invitationId: string;
  token: string;
}

export async function inviteCollaborator({
  assignmentId,
  invitedByUserId,
  invitedEmail,
}: InviteCollaboratorInput): Promise<InviteCollaboratorResult> {
  const email = invitedEmail.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error(`Invalid email: ${invitedEmail}`);
  }

  const token = generateInvitationToken();

  const { data, error } = await supabase
    .from('assignment_invitations')
    .insert({
      assignment_id: assignmentId,
      invited_email: email,
      invited_by_user_id: invitedByUserId,
      invitation_token: token,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Invitation insert returned no data');
  }

  return { invitationId: data.id, token };
}

/**
 * Convenience wrapper for inviting several emails at once from the
 * Create Assignment form. Each invite is independent — one failing
 * (e.g. a malformed email) does not roll back the others.
 */
export async function inviteCollaborators(
  assignmentId: string,
  invitedByUserId: string,
  emails: string[]
): Promise<{ succeeded: string[]; failed: { email: string; error: string }[] }> {
  const succeeded: string[] = [];
  const failed: { email: string; error: string }[] = [];

  for (const email of emails) {
    try {
      await inviteCollaborator({ assignmentId, invitedByUserId, invitedEmail: email });
      succeeded.push(email);
    } catch (e: any) {
      failed.push({ email, error: e.message ?? 'Unknown error' });
    }
  }

  return { succeeded, failed };
}
