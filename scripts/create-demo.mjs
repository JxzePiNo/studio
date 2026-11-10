import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
const pdf = await PDFDocument.create();
const regular = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const serif = await pdf.embedFont(StandardFonts.TimesRoman);
const green = rgb(.18,.33,.23), muted = rgb(.48,.55,.43);
const slides = [
  { title: 'Learning from data', subtitle: 'An introduction to machine learning', label: '01 / THE BIG IDEA', body: ['Machine learning allows computers to learn patterns', 'from data, without explicitly programming every rule.'], cards: [['DATA', 'Examples from the world'], ['MODEL', 'A pattern we can learn'], ['PREDICTION', 'An answer for new data']], footer: 'A model learns from examples. Its goal is to generalize.' },
  { title: 'Supervised learning', subtitle: 'Learning with a teacher', label: '02 / KEY CONCEPTS', body: ['Training data contains both inputs and known labels.', 'The model learns the relationship between them.'], cards: [['INPUT', 'An email message'], ['LABEL', 'Spam or not spam'], ['TASK', 'Classify a new email']], footer: 'Classification predicts a category. Regression predicts a number.' },
  { title: 'Beyond memorization', subtitle: 'Training, testing, and generalization', label: '03 / MAKING IT WORK', body: ['A model should perform well on examples it has never seen.', 'Keep a separate test set to measure its real performance.'], cards: [['TRAINING SET', 'Learn the patterns'], ['TEST SET', 'Evaluate on unseen data'], ['OVERFITTING', 'Memorizing the training set']], footer: 'Good performance on training data alone is not enough.' },
];
for (const s of slides) {
  const p = pdf.addPage([960,540]);
  p.drawRectangle({ x:0, y:0, width:960, height:540, color:rgb(.98,.985,.965) });
  const text=(t,x,y,font,size,color=green)=>p.drawText(t,{x,y,font,size,color});
  text('MARGINE / STUDY NOTES',48,493,bold,10,muted); text(s.label,48,421,regular,11,muted);
  text(s.title,48,356,serif,49); text(s.subtitle,50,321,regular,15,muted);
  s.body.forEach((line,i)=>text(line,50,268-i*23,regular,17));
  s.cards.forEach((card,i)=>{ const x=48+i*294; p.drawRectangle({x,y:105,width:276,height:95,color:rgb(.92,.945,.89)}); text(card[0],x+17,170,bold,10,muted); text(card[1],x+17,136,regular,14); });
  p.drawLine({start:{x:48,y:77},end:{x:912,y:77},thickness:1,color:rgb(.85,.89,.81)});
  text(s.footer,48,47,regular,12,muted); text(`${slides.indexOf(s)+1} / 3`,880,47,regular,10,muted);
}
await mkdir(new URL('../public/',import.meta.url),{recursive:true});
await writeFile(new URL('../public/esempio.pdf',import.meta.url),await pdf.save());
