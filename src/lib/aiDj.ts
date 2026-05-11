export function getAiDjMessage(emotion: string): string {
  const moodMessages: Record<string, string[]> = {
    happy: [
      "You seem upbeat. Switching to energetic tracks to match your mood.",
      "Your energy looks positive. Bringing in some feel-good music."
    ],
    sad: [
      "You seem a little down. Playing softer music to create a calmer space.",
      "Your mood feels low. Switching to gentle tracks for comfort."
    ],
    angry: [
      "You seem tense. Moving into calming music to help you reset.",
      "I sense some stress. Switching to a more relaxing playlist."
    ],
    neutral: [
      "You look focused. Keeping the music steady with study-friendly beats.",
      "Your mood seems balanced. Playing chill tracks to maintain the flow."
    ],
    surprised: [
      "Your energy just shifted. Bringing in something more dynamic.",
      "You seem more alert now. Switching to brighter, upbeat tracks."
    ],
    fearful: [
      "You seem uneasy. Playing ambient music to help create a calmer mood.",
      "I detect some tension. Switching to soothing sounds."
    ],
    disgusted: [
      "Your mood seems off. Playing relaxing tracks to reset the vibe.",
      "Let’s shift the atmosphere. Moving into smoother, calmer music."
    ]
  };

  const messages = moodMessages[emotion] || moodMessages.neutral;
  return messages[Math.floor(Math.random() * messages.length)];
}
