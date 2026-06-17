import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/mongodb';
import ChatSession from '@/lib/models/ChatSession';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectDB();
    const sessionAuth = await getServerSession(authOptions);
    const userId = sessionAuth?.user?.id;

    if (!userId) {
      return NextResponse.json({ sessions: [] });
    }

    const sessions = await ChatSession.find({ userId })
      .select('sessionId title updatedAt')
      .sort({ updatedAt: -1 });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json({ error: 'Gagal memuat daftar sesi' }, { status: 500 });
  }
}
