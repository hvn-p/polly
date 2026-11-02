# How Polly teaches

This guide states the rules every activity, score, scheduler and spec in Polly
respects, and the evidence behind each one. It builds on the product principles in
`PRODUCT.md`, which say what Polly teaches, and covers how the learner is modelled
and what counts as progress.

Each rule names its evidence level:

- **Meta-analysis**: several studies pooled, the effect holds across them.
- **Studies**: single studies, a review or theory with lab support.
- **Design choice**: our extrapolation from the research, not tested as such. It can
  change when Polly's own data says otherwise.

## Three ways to track a learner

A learner's knowledge does not all behave the same way, so Polly tracks it with
three mechanisms.

| What is tracked | Mechanism | Why |
|---|---|---|
| What can be recalled: a word, a chunk, a rule stated as a fact | Spaced repetition (FSRS), one memory state per item | Recall is item by item and decays with time (Studies: 19) |
| Speaking skills: pronunciation, prosody, fluency, accuracy, complexity | A trajectory per skill: a running estimate with its uncertainty, built from many measurements | A skill improves through practice, not through recall at an interval, and no evidence supports treating it as mastered or not (Design choice, rule 4 below) |
| Comfort with speaking: anxiety, willingness to talk, perceived competence | A slow profile from a short questionnaire and from behaviour | It changes over weeks and sets how a session is built, not what is reviewed (Meta-analysis: 14, 16) |

## Speaking skills

**Pronunciation is tracked per sound contrast for the learner's language pair**, such
as /r/-/l/ for a Japanese speaker learning English. A contrast is what the learner
confuses, and which contrasts matter depends on their native language.

- The ear comes before the mouth: perception training with many voices
  (high-variability phonetic training) first, then controlled production with
  explicit feedback, then spontaneous speech. Perception gains are solid and retained
  (Meta-analysis: 4); transfer to production is small to medium (Meta-analysis: 3).
- Automatic feedback on pronunciation works, mostly on single sounds (Meta-analysis:
  5). Instruction works best on controlled tasks targeting one feature
  (Meta-analysis: 1, 2).
- A sound-level score is not proof of mastery until it has been checked against
  human judgment for that language pair (open question below).

**Prosody** (stress and intonation) is compared with a model utterance and trained by
shadowing with feedback, on the same stages as single sounds. The evidence is weak:
automatic feedback barely moves it (Meta-analysis: 5), and shadowing helps prosody
and fluency more than single sounds (Studies: 13).

**Fluency** is measured, not judged: speech rate, pauses in the middle of a clause,
pause length, and length of runs without hesitation. Mid-clause pauses are the best
sign of breakdown, and speed and pause frequency track how fluent listeners find the
speaker (Meta-analysis: 6). It improves through task repetition, the same task told
in less and less time (4/3/2), on different days, with varied tasks so the gain
transfers. Repetition helps whatever the interval (Studies: 7, 8).

**Accuracy is tracked per error type and construction**, such as "omits past -ed".
Each unit moves through three stages: understood (the rule can be stated), controlled
(produced correctly when attention is on it), spontaneous (produced correctly in free
speech). Practice follows the stages: explanation, then controlled practice, then
timed or communicative tasks (Studies: 15). When the learner errs, Polly first prompts
them to correct themselves before giving the answer: prompts work better than recasts
(Meta-analysis: 12). Spacing helps grammar (Meta-analysis: 10), but the best gap is
unsettled (Studies: 11).

**Complexity** (lexical variety, subordination) is read from the transcript. It is not
scheduled; it rises through task design and repetition (Meta-analysis: 9).

## Comfort with speaking

The learner fills in a short anxiety questionnaire (8 items, Studies: 17) at most
once a month; behaviour such as conversations skipped completes it. A learner with
high anxiety gets more rehearsal (repeated tasks, shadowing) before open conversation.
Anxiety and achievement are linked, and perceived competence is the strongest
predictor of willingness to talk (Meta-analysis: 14, 16), but the direction of cause
is debated, so the profile shapes the session and never blocks progress. The adapted
wording for an app is not validated (Design choice).

## Rules across all skills

1. **The error log is the hub.** An error the AI notices, quoting what the learner
   said, becomes an accuracy unit. That unit feeds a recall item for its rule and a
   target in the next guided production. It counts as fixed only when its error rate
   drops in spontaneous speech (Design choice).
2. **Controlled and spontaneous speech are scored separately.** Gains show first and
   most on controlled tasks; transfer to free speech is the weak link (Meta-analysis:
   1, 3).
3. **One feedback focus per exercise.** The learner attends to one dimension at a
   time; repetition frees attention for the next (Design choice, consistent with 9).
4. **No binary mastery for speaking.** Speaking metrics stay continuous. Item
   difficulty models suit facts (Studies: 18), and no evidence supports mastery
   models for speaking (Design choice).
5. **Every score carries its evidence**: the sounds, words or utterance it was
   computed from. An AI judgment quotes the learner; a measurement points to the
   recording.

## Open questions

- How well sound-level scores agree with human raters, per language pair. Until
  checked, they guide practice but do not prove mastery.
- How to rank pronunciation targets by their effect on intelligibility, per pair.
- Whether AI error judgments agree with human annotation, per language.
- How much the learner's native fluency style shapes their fluency in the target
  language, and how to set a personal baseline.
- When speech counts as automatized: no validated threshold exists.
- The best spacing for speaking practice: barely tested (Studies: 7).

## References

Entries marked (abstract) were read from abstracts or search results only: check
their figures before quoting them.

1. Saito & Plonsky 2019, *Language Learning* 69(3), doi:10.1111/lang.12345
2. Lee, Jang & Plonsky 2015, *Applied Linguistics* (abstract)
3. Uchihara, Karas & Thomson 2024, *Applied Psycholinguistics*
4. Uchihara et al. 2025, *Studies in Second Language Acquisition*, HVPT meta-analysis
5. Ngo, Chen & Lai 2024, *ReCALL*, ASR pronunciation feedback meta-analysis
6. Suzuki, Kormos & Uchihara 2021, *Modern Language Journal* 105(2) (abstract)
7. Kakitani & Kormos 2024, *Studies in Second Language Acquisition* 46,
   doi:10.1017/S0272263124000251
8. Bui, Ahmadian & Hunter 2019, *System* 81 (abstract)
9. Abdi Tabari, Zhuang & Farahanynia 2025, *System* 135,
   doi:10.1016/j.system.2025.103868 (abstract)
10. Kim & Webb 2022, *Language Learning* 72(1), doi:10.1111/lang.12479
11. Suzuki & DeKeyser 2017, *Language Teaching Research* 21(2); Suzuki 2017,
    *Language Learning* 67(3) (abstract)
12. Lyster & Saito 2010, *Studies in Second Language Acquisition* 32,
    doi:10.1017/S0272263109990520
13. Systematic review of shadowing, 44 studies, Oxford University Research Archive,
    https://ora.ox.ac.uk/objects/uuid:3104cae1-3a6b-400a-b173-de44384238d2 (abstract)
14. Teimouri, Goetze & Plonsky 2019, *Studies in Second Language Acquisition* 41(2)
    (abstract)
15. DeKeyser & Criado 2013, encyclopedia entry on automatization and practice
16. Elahi Shirvan et al. 2019, *Journal of Psycholinguistic Research* 48,
    doi:10.1007/s10936-019-09656-9 (abstract)
17. Botes et al. 2022, *Applied Linguistics* 43, doi:10.1093/applin/amac018
18. Pelánek 2016, *Computers & Education*, Elo rating in education (abstract)
19. Settles & Meeder 2016, ACL, half-life regression for spaced repetition
