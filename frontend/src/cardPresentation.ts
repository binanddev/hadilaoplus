/** Keep 3D/sound cues independent from the role-specific identities in the rule engine. */
export function presentationKind(type = ''): string {
  const card = type.replace(/^(?:n|k|noble|king)_/, '');
  if (card === 'sub_rosa') return 'inspect';
  if (['betrayal', 'grudge'].includes(card)) return 'theft';
  if (['royal_bomb', 'bomb'].includes(card)) return 'bomb';
  if (['knight', 'face_down_knight', 'isolation', 'kings_eye', 'king_s_eye', 'shield'].includes(card)) return 'shield';
  if (['betray_the_king', 'black_plague', 'divine_right', 'icarus', 'indebted', 'mad_king', 'meat_for_meat', 'suppress_rebellion', 'unprotected', 'we_ride_together', 'peoples_champion', 'people_s_champion'].includes(card)) return 'mad_king';
  if (['shadow_deal', 'beggars_blessing', 'beggar_s_blessing', 'subsidies', 'allies', 'scout', 'hindsight'].includes(card)) return 'gift';
  if (['loyal_dog'].includes(card)) return 'loyal_dog';
  if (['actors', 'bend_the_knee', 'royal_parrot', 'parrot', 'snakes', 'scapegoat'].includes(card)) return 'parrot';
  if (['tithe', 'loyalty', 'debt_collector', 'anchor', 'bad_blood'].includes(card)) return 'tax';
  return card;
}
