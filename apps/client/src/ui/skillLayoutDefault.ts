/** Kiểu thanh chiêu lúc vào: người chơi đã chọn thì theo lựa chọn; chưa chọn thì camera iso (mặc định) dùng thanh giữa dưới để không che vùng chiến bên phải, còn lại cung góc phải dưới. */
export function initialSkillLayout(saved: string | null, iso: boolean): 'arc' | 'bar' {
  if (saved === 'bar' || saved === 'arc') return saved;
  return iso ? 'bar' : 'arc';
}
