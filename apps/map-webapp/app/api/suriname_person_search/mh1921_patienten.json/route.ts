import { connection } from 'next/server';

// The projection wall expects Datasette's array response. Its bundled snapshot
// remains the fallback if this live endpoint is unavailable.
export async function GET() {
  await connection();
  try {
    const response = await fetch('https://hackalod.sbco.design/api/suriname_person_search/mh1921_patienten.json?_shape=array&_size=max', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Patients HTTP ${response.status}`);
    const patients = await response.json();
    if (!Array.isArray(patients)) throw new Error('Invalid patient response');
    return Response.json(patients);
  } catch (error) {
    console.error('Hospital patients:', error);
    return Response.json({ error: 'Patient data unavailable' }, { status: 502 });
  }
}
