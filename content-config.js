(function (root, factory) {
  const config = factory();
  if (typeof module === 'object' && module.exports) module.exports = config;
  else root.ContentConfig = config;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    subjects: {
      english: { label: '英', color: '#159fea' }, thinking: { label: '思', color: '#ff746a' },
      pinyin: { label: '拼', color: '#ffb72e' }, math: { label: '数', color: '#9964ec' }, reading: { label: '阅', color: '#e967a2' }
    },
    heroes: [
      { id: 'ultraman', name: '奥特曼', art: 'avatar-ultraman', image: './assets/images/illustration-atlas.png' },
      { id: 'hero-02', name: '第二位英雄', image: null, missing: '缺少第二位独立英雄徽章图片' },
      { id: 'hero-03', name: '第三位英雄', image: null, missing: '缺少第三位独立英雄徽章图片' }
    ],
    courses: [
      { id: 'english', name: '趣味英语', subject: 'english' },
      { id: 'thinking', name: '思维训练', subject: 'thinking' },
      { id: 'pinyin', name: '快乐拼音', subject: 'pinyin' },
      { id: 'math', name: '数学启蒙', subject: 'math' },
      { id: 'reading', name: '趣味阅读', subject: 'reading' }
    ].map(course => ({ ...course, entry: './report.html#course=' + course.id, heroOrder: ['ultraman', 'hero-02', 'hero-03'] })),
    copy: {
      first: '看完5个视频，合成英雄', remaining: '再看{n}个视频，点亮英雄',
      unlocked: '英雄已点亮，继续收集下一位', collecting: '再看{n}个视频，收集下一位',
      complete: '已集齐配置中的英雄，继续收集能量', start: '开始学习', resume: '继续学习', collect: '继续收集',
      rule: '看完1个视频 → 点亮1枚能量徽章 · 集齐5枚 → 合成英雄'
    }
  };
});
