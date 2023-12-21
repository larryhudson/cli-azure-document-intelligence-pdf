node split-pdf-into-pages.js pdf-path.pdf | parallel -j 3 'node extract-text-from-pdf.js {} | node correct-text.js'
