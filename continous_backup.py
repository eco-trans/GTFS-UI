from box_sdk_gen import BoxClient, BoxDeveloperTokenAuth

def main(token: str):
    auth: BoxDeveloperTokenAuth = BoxDeveloperTokenAuth(token=token)
    client: BoxClient = BoxClient(auth=auth)
    for item in client.folders.get_folder_items('0').entries:
        print(item.name)

if __name__ == '__main__':
    main('LLIAbXmz9W3e3pKKMAJCTJtEloBqSE3w')