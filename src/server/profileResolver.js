// Исторический файл profileResolver.
// Логика разрешения профиля перенесена в src/server/serverContext.js (resolveServerContext).
// Оставляем заглушку на случай старых импортов (если где-то появятся).

export const resolveProfileFromRequest = async () => {
  throw new Error(
    'resolveProfileFromRequest устарел. Используйте resolveServerContext из src/server/serverContext.js'
  );
}
