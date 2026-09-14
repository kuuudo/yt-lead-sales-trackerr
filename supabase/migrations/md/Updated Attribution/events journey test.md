Pixel_purchase

id,token,session_id,video_id,campaign_id,user_id,amount,created_at,event_type,organization_id,promotion_id,pricing_version_id,conversion_id,asset_id
1d5467f8-4498-4998-893e-c2586b0c5ca9,,46fcfdf0-a85d-4834-813b-d3fda61d92ef,3b9dbc2c-7516-4c27-8135-005f863eb4bd,6796ed7f-2226-4c6d-82f7-d293236b9a63,cd180432-44c5-4a20-b778-66b7753191f0,0,2026-09-12 18:41:07.871927+00,newsletter,62640339-150a-4e6a-bdf3-9f1896cc01e7,a778a5be-6bd3-41bc-8765-2bcf247f11ba,5bfeee61-093e-41db-9518-72115e35256a,4121923b-dfb8-4613-9020-a2f47c3db450,0a089efa-c4c2-4f7c-99b3-27dd900f2872

Grab the session_id 46fcfdf0-a85d-4834-813b-d3fda61d92ef  
  Video_id = 3b9dbc2c-7516-4c27-8135-005f863eb4bd

Go to events table, session_id = 46fcfdf0-a85d-4834-813b-d3fda61d92ef,    Video_id = 3b9dbc2c-7516-4c27-8135-005f863eb4bd

I see 

id,session_id,video_id,campaign_id,event_type,value,created_at,lead_magnet_id,organization_id,promotion_id,asset_id,redirect_link_id,tracking_hostname,link_type,bridge_token,url
2f821134-1c21-4ed1-922a-06b6df76f367,46fcfdf0-a85d-4834-813b-d3fda61d92ef,3b9dbc2c-7516-4c27-8135-005f863eb4bd,6796ed7f-2226-4c6d-82f7-d293236b9a63,newsletter,,2026-09-12 18:39:54.350719+00,,9d9a8937-518f-4525-997e-7067d604238f,a778a5be-6bd3-41bc-8765-2bcf247f11ba,,2712755a-4425-4488-b751-26949106debe,,newsletter,,https://www.vstrk.com/6mxK
 
So in events grab the redirect_link id  =  2712755a-4425-4488-b751-26949106debe

Go to redirect_links  id = 2712755a-4425-4488-b751-26949106debe

We see id,token,video_id,campaign_id,link_type,destination_url,created_at,lead_magnet_id,organization_id,promotion_id,asset_id,tracking_hostname,bridge_token
2712755a-4425-4488-b751-26949106debe,6mxK,3b9dbc2c-7516-4c27-8135-005f863eb4bd,6796ed7f-2226-4c6d-82f7-d293236b9a63,newsletter,https://www.kaksidigitals.com/newsletter,2026-09-07 17:05:40.62597+00,,9d9a8937-518f-4525-997e-7067d604238f,a778a5be-6bd3-41bc-8765-2bcf247f11ba,,,


Ok now i have slight problem so we can grab the 
events id = 2f821134-1c21-4ed1-922a-06b6df76f367



I want to matchi this in event_journey , i actually dont know the correct way to do it (i can tell it to find in event_journey event_id but only consist the last one ? [
  "8ef81868-0e52-4310-be0d-2bb6bbebd07c",
  "761c1578-f423-496e-b522-5012a59b8c52",
  "19f24d21-b3f9-42db-a3ea-842be3979f8c",
  "126b3248-518b-4bbb-9ccd-9df48cbce482",
  "00ad942a-7413-4866-847c-34fc24bb8f69",
  "2f821134-1c21-4ed1-922a-06b6df76f367" (like this one?) 
]
   





id,journey_id,event_ids,journey_snapshot,redirect_link_id,created_at
68ad19b4-36ff-4948-9237-c972babb915f,4eb94870-4578-437e-b113-01ff50d028f2,"[""8ef81868-0e52-4310-be0d-2bb6bbebd07c"", ""761c1578-f423-496e-b522-5012a59b8c52"", ""19f24d21-b3f9-42db-a3ea-842be3979f8c"", ""126b3248-518b-4bbb-9ccd-9df48cbce482"", ""00ad942a-7413-4866-847c-34fc24bb8f69"", ""2f821134-1c21-4ed1-922a-06b6df76f367""]","[{""asset_id"": ""0a089efa-c4c2-4f7c-99b3-27dd900f2872"", ""video_id"": ""52bfbc71-635f-47ea-ab6c-77ad1d083933"", ""redirect_link_id"": ""cd108a21-ea9e-4a8c-ab21-13c8ffe189ff"", ""destination_video_id"": ""16be821f-9554-4a37-873c-f38afb2d4e3a""}, {""asset_id"": ""92f8b5a0-d18f-40d8-bca1-be74ee60ce3f"", ""video_id"": ""16be821f-9554-4a37-873c-f38afb2d4e3a"", ""redirect_link_id"": ""8982c9e7-c02d-433c-9aa1-50e32f213fa3"", ""destination_video_id"": ""66b840be-ae6c-4990-9fa3-c42fda55beb0""}, {""asset_id"": ""72d2cb4d-a7a5-4046-b209-707b86b124a5"", ""video_id"": ""66b840be-ae6c-4990-9fa3-c42fda55beb0"", ""redirect_link_id"": ""3d78d839-c736-4e6f-92d2-83bbb9da6fd9"", ""destination_video_id"": ""19ded023-ae85-4af2-a2e9-f4b42fffc69f""}, {""asset_id"": ""cd08c4ec-48dd-493d-abbf-d274a98ac467"", ""video_id"": ""19ded023-ae85-4af2-a2e9-f4b42fffc69f"", ""redirect_link_id"": ""8eb7c1fd-10d6-46cb-b3a9-8aa740712c22"", ""destination_video_id"": ""3b9dbc2c-7516-4c27-8135-005f863eb4bd""}, {""asset_id"": null, ""video_id"": ""3b9dbc2c-7516-4c27-8135-005f863eb4bd"", ""redirect_link_id"": ""2712755a-4425-4488-b751-26949106debe"", ""destination_video_id"": null}]",2712755a-4425-4488-b751-26949106debe,2026-09-12 18:39:54.563935+00





