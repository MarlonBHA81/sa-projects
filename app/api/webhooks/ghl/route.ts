import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Contact = {
  id?: string;
  contact_id?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  source?: string;
};
type Payload = { locationId?: string; location_id?: string; contact?: Contact } & Contact;

// Inbound GHL webhook for real-time new contacts. Protected by a shared secret.
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (process.env.CRON_SECRET && url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Payload;
  const locationId = body.locationId ?? body.location_id;
  const contact: Contact = body.contact ?? body;
  const contactId = contact.id ?? contact.contact_id;
  if (!locationId || !contactId) return NextResponse.json({ ignored: true });

  const build = await prisma.funnelBuild.findFirst({
    where: { ghlLocationId: locationId },
    select: { id: true },
  });
  if (!build) return NextResponse.json({ ignored: true });

  await prisma.lead.upsert({
    where: { funnelBuildId_ghlContactId: { funnelBuildId: build.id, ghlContactId: String(contactId) } },
    create: {
      funnelBuildId: build.id,
      ghlContactId: String(contactId),
      name: contact.contactName ?? null,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      source: contact.source ?? "Direct",
    },
    update: { email: contact.email ?? undefined, phone: contact.phone ?? undefined },
  });
  return NextResponse.json({ ok: true });
}
