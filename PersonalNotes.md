Initial Data Loader

Parameters: Needs a JSON file with rss and name data
Goal: Load the JSON into the "rss" table

Step-by-Step process:
- Implement it a service in the rss module

------

RSS Module 

Parameters: "name" and (rss) "link", taken from the "rss" table.
Dependencies: JSON file with the RSS links (done)
Goal: The module needs to insert into the "articles" table, the following columns:
- name 
- link to image
- link to article 
- description

So that the articles module can send fetch it and the FE display it.

Step-by-step process:
- Via batching, access each link.
- The logic should deduce where each important tag is (needs trial and error).
- Grab the data and insert it into the appropriate table.

-----

Article Module

Parameters: "articles" table
Dependencies: RSS Module functionality
Goal: Provide the api so that the FE can query the corresponding format 

Step-by-step process:
- Probably just a simple crud.

-----

CRON Module

Parameters: Maybe just a timer?
Dependencies: RSS Module functionality
Goal: Update the recorded articles in the "articles" table

Step-by-step process:
- Probably just execute the RSS Module launch command on a timer.
- Maybe clean up the database at some point.
