# Whole entries written by hand, read by build_dataset.load_hand_entries()
# during assemble(). Each *.json file is a list of objects:
#   word, domains, phonetic (General American IPA), meanings
#   ([{"pos", "senses": ["definition", ...]}]), nuance (the enrichment
#   schema: core, pronunciation{ipa,respelling,tip}, us_usage, register,
#   connotation, usage_note, word_family, distinctions, antonyms,
#   collocations, examples, analogy, etymology, common_mistakes,
#   biblical_note, traditions), and optionally etymology and conversation.
# zipf comes from wordfreq. A key the caches already produce is skipped, so
# a dictionary entry always wins over a hand entry with the same key.
