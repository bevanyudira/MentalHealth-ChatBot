import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/mongodb';
import ChatSession from '@/lib/models/ChatSession';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  try {
    const { sessionId } = params;
    const body = await request.json();
    const { title } = body;

    if (!sessionId || !title) {
      return NextResponse.json({ error: 'sessionId dan title wajib diisi' }, { status: 400 });
    }

    await connectDB();
    const sessionAuth = await getServerSession(authOptions);
    const userId = sessionAuth?.user?.id;

    const session = await ChatSession.findOne({ sessionId });

    if (!session) {
      return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 });
    }

    if (session.userId && session.userId.toString() !== userId) {
      return NextResponse.json({ error: 'Tidak ada akses ke sesi ini' }, { status: 403 });
    }

    session.title = title;
    await session.save();

    return NextResponse.json({ success: true, title: session.title });
  } catch (error) {
    console.error('Error updating session:', error);
    return NextResponse.json({ error: 'Gagal memperbarui sesi' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { sessionId } = params;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId wajib diisi' }, { status: 400 });
    }

    await connectDB();
    const sessionAuth = await getServerSession(authOptions);
    const userId = sessionAuth?.user?.id;

    const session = await ChatSession.findOne({ sessionId });

    if (!session) {
      return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 });
    }

    if (session.userId && session.userId.toString() !== userId) {
      return NextResponse.json({ error: 'Tidak ada akses ke sesi ini' }, { status: 403 });
    }

    await ChatSession.deleteOne({ sessionId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    return NextResponse.json({ error: 'Gagal menghapus sesi' }, { status: 500 });
  }
}
