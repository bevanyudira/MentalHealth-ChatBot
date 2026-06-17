import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/mongodb';
import ChatSession from '@/lib/models/ChatSession';
import SYSTEM_PROMPT from '@/lib/systemPrompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY belum didefinisikan di .env.local');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export async function POST(request) {
  try {
    const body = await request.json();
    const message = body?.message?.trim();
    const sessionId = body?.sessionId?.trim();

    if (!message || !sessionId) {
      return NextResponse.json(
        { error: 'message dan sessionId wajib diisi' },
        { status: 400 }
      );
    }

    await connectDB();

    const sessionAuth = await getServerSession(authOptions);
    const userId = sessionAuth?.user?.id;

    let session = await ChatSession.findOne({ sessionId });

    if (session) {
      if (session.userId && session.userId.toString() !== userId) {
        return NextResponse.json({ error: 'Tidak ada akses ke sesi ini' }, { status: 403 });
      }
    } else {
      session = new ChatSession({ 
        sessionId: sessionId, 
        userId: userId || null, 
        history: [],
        title: message.substring(0, 30) + (message.length > 30 ? '...' : '')
      });
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    // Bersihkan history dari field _id bawaan Mongoose
    // karena Gemini API akan me-reject payload jika ada field tidak dikenal
    const cleanHistory = session.history.map((msg) => ({
      role: msg.role,
      parts: msg.parts.map((p) => ({ text: p.text })),
    }));

    const chat = model.startChat({
      history: cleanHistory,
    });

    const result = await chat.sendMessage(message);
    const reply = result.response.text().trim();

    session.history.push(
      {
        role: 'user',
        parts: [{ text: message }],
      },
      {
        role: 'model',
        parts: [{ text: reply }],
      }
    );

    await session.save();

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Error di /api/chat:', error);

    let isRateLimit = false;
    let retryDelaySeconds = 20;
    let isDailyQuota = false;

    if (error.status === 429 || error.message?.includes('429')) {
      isRateLimit = true;
      
      // Coba parse errorDetails dari respons Google Generative AI
      if (error.errorDetails && Array.isArray(error.errorDetails)) {
        for (const detail of error.errorDetails) {
          if (detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo' && detail.retryDelay) {
            const delay = parseInt(detail.retryDelay.replace('s', ''), 10);
            if (!isNaN(delay)) retryDelaySeconds = delay;
          }
          if (detail['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure' && Array.isArray(detail.violations)) {
            for (const v of detail.violations) {
              // Deteksi jika limit yang dicapai adalah per hari (PerDay)
              if (v.quotaId && v.quotaId.toLowerCase().includes('perday')) {
                isDailyQuota = true;
              }
            }
          }
        }
      }
      // Jika error message string dari Mongoose/Google berisi tulisan PerDay
      if (error.message?.toLowerCase().includes('perday')) {
        isDailyQuota = true;
      }
    }

    if (isRateLimit) {
      if (isDailyQuota) {
        return NextResponse.json(
          { code: 'QUOTA_EXCEEDED', error: 'Batas penggunaan harian Gemini API Anda telah habis. Silakan coba lagi besok.' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { code: 'RATE_LIMIT', retryDelay: retryDelaySeconds, error: 'Batas pesan terlalu cepat. Silakan tunggu.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { code: 'SERVER_ERROR', error: 'Terjadi kesalahan pada server. Silakan coba lagi.' },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    await connectDB();

    const sessionAuth = await getServerSession(authOptions);
    const userId = sessionAuth?.user?.id;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const session = await ChatSession.findOne({ sessionId });

    if (session && session.userId && session.userId.toString() !== userId) {
      return NextResponse.json({ error: 'Tidak ada akses ke sesi ini' }, { status: 403 });
    }

    if (!session) {
      return NextResponse.json({ history: [] });
    }

    return NextResponse.json({ history: session.history });
  } catch (error) {
    console.error('Error fetching history:', error);
    return NextResponse.json({ error: 'Gagal memuat history' }, { status: 500 });
  }
}
