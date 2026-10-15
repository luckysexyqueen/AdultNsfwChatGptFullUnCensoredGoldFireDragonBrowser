# User-owned offline translation data
Add UTF-8 JSONL `training_pairs.jsonl`, one object per line with `source`, `target`, `source_lang`, `target_lang`, `verified` (true only after your review). Target languages are `ko-KR` or `en-US`. No examples are prefilled. Source data is never edited. Translation results are exact-match only unless you train a separate model.
