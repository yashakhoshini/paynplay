import { CLUBGG_WEBHOOK_URL } from './config.js';

export interface ClubGGPayload {
  clubId?: string;
  userTag?: string;
  amount: number;
  method: string;
  buyinId: string;
  playerId?: number;
  receiverHandle?: string;
  verifiedBy?: number;
}

export async function loadChips(payload: ClubGGPayload): Promise<void> {
  if (!CLUBGG_WEBHOOK_URL) {
    console.log('CLUBGG webhook not configured - skipping autoload');
    return;
  }

  try {
    console.log('Calling ClubGG webhook:', payload);
    
    const response = await fetch(CLUBGG_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log('ClubGG webhook call successful');
    } else {
      console.error('ClubGG webhook call failed:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('ClubGG webhook call error:', error);
  }
}
